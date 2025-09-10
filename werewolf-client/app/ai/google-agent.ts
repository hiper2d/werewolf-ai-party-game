import {AbstractAgent} from "@/app/ai/abstract-agent";
import {AIMessage, TokenUsage} from "@/app/api/game-models";
import {GoogleGenAI} from "@google/genai";
import {ResponseSchema} from "@/app/ai/prompts/ai-schemas";
import {cleanResponse} from "@/app/utils/message-utils";
import {ModelOverloadError, ModelRateLimitError, ModelUnavailableError, ModelAuthenticationError, ModelQuotaExceededError} from "@/app/ai/errors";

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
        askingAgent: (name: string, model: string) => `Asking ${name} ${model} agent`,
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

    // Schema instruction template
    private readonly schemaTemplate = {
        instructions: (schema: ResponseSchema) =>
            `Your response must be a valid JSON object matching this schema:
${JSON.stringify(schema, null, 2)}

Ensure your response strictly follows the schema requirements.`,
    };

    constructor(name: string, instruction: string, model: string, apiKey: string, enableThinking: boolean = false) {
        super(name, instruction, model, 0.2, enableThinking);
        this.client = new GoogleGenAI({
            apiKey: apiKey
        });
    }


    protected async doAskWithSchema(schema: ResponseSchema, messages: AIMessage[]): Promise<[string, string, TokenUsage?]> {
        try {
            // Convert all messages except the last one
            const historyMessages = messages.slice(0, -1);
            const contents = this.convertToContents(historyMessages);
            
            // Get the last message and add schema instructions
            const lastMessage = messages[messages.length - 1];
            const schemaInstructions = this.buildSchemaInstructions(schema);
            const fullPrompt = this.buildFullPrompt(lastMessage.content, schemaInstructions);
            
            // Add the last message with schema instructions
            contents.push({
                role: this.convertRole(lastMessage.role),
                parts: [{ text: fullPrompt }]
            });
            
            const config: any = {
                temperature: this.temperature,
                responseMimeType: "application/json",
                responseSchema: schema
            };

            // Add thinking config for Google models with thinking mode
            if (this.enableThinking) {
                config.thinkingConfig = {
                    includeThoughts: true,
                    thinkingBudget: 1024  // Use reasonable budget, -1 for dynamic thinking
                };
            }

            const response = await this.client.models.generateContent({
                model: this.model,
                contents: contents,
                config: config
            });
            
            // Handle thinking content if present and thinking mode is enabled
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

            // Enhanced logging for debugging empty responses
            this.logger(`Schema response received - hasText: ${!!response.text}, textLength: ${response.text ? response.text.length : 0}, responseKeys: ${Object.keys(response || {}).join(', ')}`);
            
            if (!response.text) {
                this.logger(`Empty schema response details - responseType: ${typeof response}, responseKeys: ${response ? Object.keys(response).join(', ') : 'response is null/undefined'}, messagesCount: ${messages.length}, contentsCount: ${contents.length}, lastMessagePreview: ${lastMessage.content.substring(0, 200)}...`);
                throw new Error(this.errorMessages.emptyResponse);
            }

            return [cleanResponse(response.text), thinkingContent, undefined];
        } catch (error) {
            this.logger(this.logTemplates.error(this.name, error));
            
            // Check for specific Gemini API errors and throw appropriate exceptions
            this.handleGeminiError(error);
            
            throw error;
        }
    }

    private buildSchemaInstructions(schema: ResponseSchema): string {
        return this.schemaTemplate.instructions(schema);
    }

    private buildFullPrompt(content: string, instructions: string): string {
        return `${content}

${instructions}`;
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
