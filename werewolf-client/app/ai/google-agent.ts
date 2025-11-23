import { AbstractAgent } from "@/app/ai/abstract-agent";
import { AIMessage, TokenUsage } from "@/app/api/game-models";
import { GoogleGenAI, Type } from "@google/genai";
import { cleanResponse } from "@/app/utils/message-utils";
import { ModelOverloadError, ModelRateLimitError, ModelUnavailableError, ModelAuthenticationError, ModelQuotaExceededError } from "@/app/ai/errors";
import { z } from 'zod';
import { ZodSchemaConverter } from './zod-schema-converter';
import { safeValidateResponse } from './prompts/zod-schemas';
import { calculateGoogleCost } from '@/app/utils/pricing/google-pricing';

type GoogleRole = 'model' | 'user';

// Define types for the new Google GenAI SDK
interface Part {
    text: string;
}

interface Content {
    role: GoogleRole;
    parts: Part[];
}

export class GoogleAgent extends AbstractAgent {
    private readonly client: GoogleGenAI;
    private readonly defaultConfig = {
        responseMimeType: "application/json"
    };

    // Log message templates
    private readonly logTemplates = {
        error: (name: string, error: unknown) => `Error in ${name} agent: ${error}`,
    };

    // Error message templates
    private readonly errorMessages = {
        emptyResponse: 'Empty response from Google API - check logs for detailed response info',
        invalidFormat: 'Invalid response format from Google API',
        apiError: (error: unknown) =>
            `Failed to get response from Google API: ${error instanceof Error ? error.message : String(error)}`,
        unsupportedRole: (role: string) => `Unsupported role type: ${role}`,
    };


    constructor(name: string, instruction: string, model: string, apiKey: string, enableThinking: boolean = false) {
        super(name, instruction, model, 0.2, enableThinking);
        this.client = new GoogleGenAI({
            apiKey: apiKey
        });
    }




    private convertToContents(messages: AIMessage[]): Content[] {
        try {
            return messages.map(msg => ({
                role: this.convertRole(msg.role),
                parts: [{ text: msg.content }]
            }));
        } catch (error) {
            throw error;
        }
    }

    private convertRole(role: string): GoogleRole {
        if (role === 'assistant') {
            return 'model';
        }
        if (role === 'user' || role === 'system') {
            return 'user';
        }
        throw new Error(this.errorMessages.unsupportedRole(role));
    }

    private calculateCost(inputTokens: number, outputTokens: number, totalTokens: number): number {
        const contextTokens = this.deriveContextTokens(inputTokens, outputTokens, totalTokens);

        return calculateGoogleCost(this.model, inputTokens, outputTokens, {
            contextTokens,
            totalTokens
        });
    }

    private calculateCostWithCacheHits(inputTokens: number, outputTokens: number, totalTokens: number, cacheHitTokens: number): number {
        const contextTokens = this.deriveContextTokens(inputTokens, outputTokens, totalTokens);

        return calculateGoogleCost(this.model, inputTokens, outputTokens, {
            contextTokens,
            totalTokens,
            cacheHitTokens
        });
    }

    private deriveContextTokens(inputTokens: number, outputTokens: number, totalTokens: number): number {
        if (!totalTokens) {
            return inputTokens;
        }

        const promptAndReasoningTokens = Math.max(totalTokens - outputTokens, 0);
        return Math.max(inputTokens, promptAndReasoningTokens);
    }

    /**
     * New method using Zod with Google's Gemini API
     * This provides better schema handling and runtime validation
     */
    async askWithZodSchema<T>(zodSchema: z.ZodSchema<T>, messages: AIMessage[]): Promise<[T, string, TokenUsage?]> {
        // Validate roles first, before entering the main try-catch block
        // This ensures role validation errors are thrown directly
        const contents = this.convertToContents(messages);

        try {
            // Convert Zod schema to Google-compatible format using Type constants
            const googleSchema = ZodSchemaConverter.toGoogleSchema(zodSchema);

            const config: any = {
                temperature: this.temperature,
                responseMimeType: "application/json",
                responseSchema: googleSchema,
                maxOutputTokens: 16384  // Set to 16k to handle longer JSON responses
            };

            // Add thinking config for Google models with thinking mode
            if (this.enableThinking) {
                config.thinkingConfig = {
                    includeThoughts: true,
                    thinkingBudget: 1024
                };
            }

            this.logAsking();
            this.logSystemPrompt();
            this.logMessages(messages);

            let response;
            try {
                response = await this.client.models.generateContent({
                    model: this.model,
                    contents: contents,
                    config: config
                });
            } catch (apiError) {
                // Re-throw API errors immediately without wrapping them in schema validation errors
                this.logger(this.logTemplates.error(this.name, apiError));
                throw new Error(this.errorMessages.apiError(apiError));
            }

            // Handle thinking content if present
            let thinkingContent = "";
            if (this.enableThinking && (response as any).candidates?.[0]?.content?.parts) {
                const parts = (response as any).candidates[0].content.parts;
                const thinkingParts: string[] = [];
                for (const part of parts) {
                    if (part.thought && part.text) {
                        thinkingParts.push(part.text);
                    }
                }
                thinkingContent = thinkingParts.join('\n');
            }

            // Extract token usage from response metadata
            const usageMetadata = (response as any).usageMetadata;
            let tokenUsage: TokenUsage | undefined;
            if (usageMetadata) {
                const inputTokens = usageMetadata.promptTokenCount || 0;
                const outputTokens = usageMetadata.candidatesTokenCount || 0;
                const totalTokens = usageMetadata.totalTokenCount || 0;
                const cacheHitTokens = usageMetadata.cachedContentTokenCount || 0;

                // Calculate cost using the pricing utility with cache hit tokens
                const costUSD = this.calculateCostWithCacheHits(inputTokens, outputTokens, totalTokens, cacheHitTokens);

                tokenUsage = {
                    inputTokens,
                    outputTokens,
                    totalTokens,
                    costUSD
                };
            }

            this.logger(`Zod schema response received - hasText: ${!!response.text}, textLength: ${response.text ? response.text.length : 0}`);

            if (!response.text) {
                throw new Error(this.errorMessages.emptyResponse);
            }

            // Parse and validate the response using Zod
            let parsedContent: unknown;
            try {
                const cleanedResponse = cleanResponse(response.text);
                parsedContent = JSON.parse(cleanedResponse);
            } catch (parseError) {
                throw new Error(`Failed to parse JSON response: ${parseError}`);
            }

            // Validate using Zod schema
            const validationResult = safeValidateResponse(zodSchema, parsedContent);
            if (!validationResult.success) {
                this.logger(`Zod validation failed: ${JSON.stringify(validationResult.error.errors)}`);
                throw new Error(`Response validation failed: ${validationResult.error.message}`);
            }

            this.logger(`✅ Response validated successfully with Zod schema`);

            return [validationResult.data, thinkingContent, tokenUsage];

        } catch (error) {
            this.logger(this.logTemplates.error(this.name, error));

            // Check for specific Gemini API errors
            this.handleGeminiError(error);

            throw error;
        }
    }

    /**
     * Handles Gemini API errors and throws appropriate specific exceptions
     * @param error - The error to handle
     */
    private handleGeminiError(error: unknown): void {
        let errorMessage = '';
        let errorCode: number | undefined;
        let errorStatus = '';

        // Extract error information from different error formats
        if (error && typeof error === 'object') {
            // Check if it's a standard Error object with message
            if ('message' in error) {
                errorMessage = String((error as any).message);
            }

            // Try to parse if the message contains JSON (Gemini API format)
            try {
                const parsed = JSON.parse(errorMessage);
                if (parsed.error) {
                    errorMessage = parsed.error.message || errorMessage;
                    errorCode = parsed.error.code;
                    errorStatus = parsed.error.status;
                }
            } catch {
                // Not JSON, use the original message
            }
        } else if (typeof error === 'string') {
            // Try to parse JSON string directly
            try {
                const parsed = JSON.parse(error);
                if (parsed.error) {
                    errorMessage = parsed.error.message || error;
                    errorCode = parsed.error.code;
                    errorStatus = parsed.error.status;
                }
            } catch {
                errorMessage = error;
            }
        }

        // Throw specific exceptions based on error content
        if (errorCode === 503 || errorStatus === 'UNAVAILABLE' ||
            errorMessage.includes('model is overloaded') ||
            errorMessage.includes('overloaded')) {
            throw new ModelOverloadError(
                errorMessage || 'Model is currently overloaded. Please try again later.',
                'Gemini'
            );
        }

        if (errorCode === 429 || errorMessage.includes('rate limit') || errorMessage.includes('quota')) {
            throw new ModelRateLimitError(
                errorMessage || 'Rate limit exceeded for Gemini model.',
                'Gemini'
            );
        }

        if (errorCode === 401 || errorCode === 403 || errorMessage.includes('authentication') || errorMessage.includes('unauthorized')) {
            throw new ModelAuthenticationError(
                errorMessage || 'Authentication failed for Gemini model.',
                'Gemini'
            );
        }

        if (errorMessage.includes('quota exceeded') || errorMessage.includes('billing')) {
            throw new ModelQuotaExceededError(
                errorMessage || 'Quota exceeded for Gemini model.',
                'Gemini'
            );
        }

        if (errorCode && errorCode >= 500) {
            throw new ModelUnavailableError(
                errorMessage || 'Gemini model is temporarily unavailable.',
                'Gemini',
                'server_error'
            );
        }

        // If no specific error type is detected, don't throw - let the method return null
    }
}
