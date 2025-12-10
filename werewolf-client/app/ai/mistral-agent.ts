import { AbstractAgent } from "@/app/ai/abstract-agent";
import { Mistral } from "@mistralai/mistralai";
import { ChatCompletionResponse } from "@mistralai/mistralai/models/components";
import { AIMessage, MESSAGE_ROLE, TokenUsage } from "@/app/api/game-models";
import { cleanResponse } from "@/app/utils/message-utils";
import { z } from 'zod';
import { ZodSchemaConverter } from './zod-schema-converter';
import { safeValidateResponse } from './prompts/zod-schemas';
import { extractMistralTokenUsage, calculateCost } from '@/app/utils/pricing/token-usage-utils';

export class MistralAgent extends AbstractAgent {
    private readonly client: Mistral;
    private readonly defaultParams: Omit<Parameters<Mistral['chat']['complete']>[0], 'messages'> = {
        model: this.model,
        maxTokens: 16384,  // Set to 16k to handle longer JSON responses
        temperature: this.temperature,
    };

    // Log message templates
    private readonly logTemplates = {
        error: (name: string, error: unknown) => `Error in ${name} agent: ${error}`,
    };

    // Error message templates
    private readonly errorMessages = {
        emptyResponse: 'Empty or undefined response from Mistral API',
        invalidFormat: 'Invalid response format from Mistral API',
        apiError: (error: unknown) =>
            `Failed to get response from Mistral API: ${error instanceof Error ? error.message : String(error)}`,
    };


    constructor(name: string, instruction: string, model: string, apiKey: string, enableThinking: boolean = false) {
        super(name, instruction, model, 0.7, enableThinking);
        this.client = new Mistral({ apiKey: apiKey });

        // Note: Magistral reasoning models can generate thinking content, but only when
        // responseFormat is not set to 'json_object'. Since this game requires JSON responses,
        // thinking content will be suppressed. The models still benefit from internal reasoning
        // during generation, but thinking traces are not returned in the response.
    }



    private convertToMistralMessages(messages: AIMessage[]) {
        return messages.map(msg => ({
            role: msg.role === 'developer' ? 'system' : msg.role,
            content: msg.content
        }));
    }


    private processReply(response: ChatCompletionResponse | undefined): [string, string, TokenUsage?] {
        const message = response?.choices?.[0]?.message;

        if (!message || !message.content) {
            throw new Error(this.errorMessages.emptyResponse);
        }

        let reply = message.content;

        // Handle structured content (thinking models)
        if (Array.isArray(reply)) {
            const { content, thinking } = this.processStructuredReply(reply);

            // Log thinking information if available
            if (this.enableThinking && thinking) {
                this.logger(`Thinking content: ${thinking.length} characters of reasoning`);
            }

            return [cleanResponse(content), thinking, this.extractTokenUsage(response)];
        }

        // Handle string content (regular models)
        return [cleanResponse(reply), "", this.extractTokenUsage(response)];
    }

    private processStructuredReply(reply: unknown[]): { content: string; thinking: string } {
        let content = "";
        let thinking = "";

        // Response should have 2 parts: thinking block and text block
        for (const chunk of reply) {
            if (typeof chunk === "object" && chunk !== null && "type" in chunk) {
                if (chunk.type === "thinking" && "thinking" in chunk) {
                    // Extract thinking content from the thinking block
                    const thinkingArray = chunk.thinking as any[];
                    thinking = thinkingArray
                        .filter((item: any) => item?.type === "text" && item?.text)
                        .map((item: any) => item.text)
                        .join("");
                } else if (chunk.type === "text" && "text" in chunk) {
                    // Extract the final answer from the text block
                    content = chunk.text as string;
                }
            }
        }

        return { content, thinking };
    }

    private extractTokenUsage(response: ChatCompletionResponse | undefined): TokenUsage | undefined {
        // Use the centralized Mistral token usage extraction
        const usage = extractMistralTokenUsage(response);
        if (!usage) return undefined;

        // Log reasoning tokens if available (Magistral models)
        if (usage.reasoningTokens && usage.reasoningTokens > 0) {
            this.logger(`🧠 Reasoning tokens used: ${usage.reasoningTokens}`);
        }

        // Calculate cost using centralized pricing from ai-models.ts
        const costUSD = calculateCost(this.model, usage.promptTokens, usage.completionTokens, {
            totalTokens: usage.totalTokens
        });

        return {
            inputTokens: usage.promptTokens,
            outputTokens: usage.completionTokens,
            totalTokens: usage.totalTokens,
            costUSD
        };
    }

    /**
     * New method using Zod with Mistral API
     * This provides better schema handling and runtime validation
     * 
     * According to Mistral documentation, we should:
     * 1. Set responseFormat to { type: 'json_object' }
     * 2. Add the schema description to the last message content
     */
    async askWithZodSchema<T>(zodSchema: z.ZodSchema<T>, messages: AIMessage[]): Promise<[T, string, TokenUsage?]> {
        try {
            // Convert Zod schema to human-readable prompt description
            const schemaDescription = ZodSchemaConverter.toPromptDescription(zodSchema);

            // Convert messages to Mistral format and add schema to last message
            const convertedMessages = this.convertToMistralMessages(messages);

            // Add schema description to the last message content
            if (convertedMessages.length > 0) {
                const lastMessage = convertedMessages[convertedMessages.length - 1];
                if (lastMessage && lastMessage.content) {
                    lastMessage.content += `\n\nYour response must be a valid JSON object matching this schema:\n${schemaDescription}`;
                }
            } else {
                // If no messages, create a default user message with schema
                convertedMessages.push({
                    role: 'user',
                    content: `Please respond with a valid JSON object matching this schema:\n${schemaDescription}`
                });
            }

            // Prepare system message
            const systemMessage = {
                role: MESSAGE_ROLE.SYSTEM,
                content: this.instruction
            };

            const allMessages = [systemMessage, ...convertedMessages];

            // Build request parameters with JSON format (no jsonSchema parameter)
            const requestParams = {
                ...this.defaultParams,
                messages: allMessages,
                responseFormat: {
                    type: 'json_object' as const
                }
            };

            this.logAsking();
            this.logSystemPrompt();
            this.logMessages(messages);

            let response;
            try {
                response = await this.client.chat.complete(requestParams);
            } catch (apiError) {
                // Re-throw API errors immediately without wrapping them in schema validation errors
                this.logger(this.logTemplates.error(this.name, apiError));
                throw new Error(this.errorMessages.apiError(apiError));
            }

            if (!response || !response.choices || response.choices.length === 0) {
                throw new Error(this.errorMessages.emptyResponse);
            }

            const choice = response.choices[0];
            const content = choice.message?.content;

            if (!content) {
                throw new Error(this.errorMessages.invalidFormat);
            }

            // Extract text content from structured responses (thinking models return arrays)
            let responseText: string;
            let thinkingContent = "";

            if (Array.isArray(content)) {
                // Handle structured content (thinking models)
                const { content: extractedContent, thinking } = this.processStructuredReply(content);
                responseText = extractedContent;
                thinkingContent = thinking;
            } else if (typeof content === 'string') {
                responseText = content;
            } else {
                // Fallback for unexpected content types
                responseText = JSON.stringify(content);
            }

            this.logReply(responseText);

            // Parse and validate the response using Zod
            let parsedContent: unknown;
            try {
                const cleanedResponse = cleanResponse(responseText);
                parsedContent = JSON.parse(cleanedResponse);

                // Fix for Mistral sometimes returning nested objects when a string is expected
                // (e.g., { reply: { field1: "...", field2: "..." } } instead of { reply: "..." })
                // This can happen with complex prompts that have structured sections
                if (parsedContent && typeof parsedContent === 'object' && 'reply' in parsedContent) {
                    const reply = (parsedContent as any).reply;
                    if (reply && typeof reply === 'object') {
                        this.logger(`🔧 Converting nested reply object to string`);
                        (parsedContent as any).reply = JSON.stringify(reply, null, 2);
                    }
                }
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

            // Extract token usage
            const tokenUsage = this.extractTokenUsage(response);

            return [validationResult.data, thinkingContent, tokenUsage];

        } catch (error) {
            this.logger(this.logTemplates.error(this.name, error));
            throw new Error(this.errorMessages.apiError(error));
        }
    }
}