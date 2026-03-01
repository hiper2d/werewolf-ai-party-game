import { AbstractAgent } from "@/app/ai/abstract-agent";
import OpenAI from "openai";
import { AIMessage, TokenUsage, AgentLoggingConfig, DEFAULT_LOGGING_CONFIG } from "@/app/api/game-models";
import { cleanResponse } from "@/app/utils/message-utils";
import { extractUsageAndCalculateCost } from "@/app/utils/pricing";
import { getModelConfigByApiName } from "@/app/ai/ai-models";
import { z } from 'zod';
import { ZodSchemaConverter } from './zod-schema-converter';
import { safeValidateResponse } from './prompts/zod-schemas';

export class DeepSeekV2Agent extends AbstractAgent {
    private readonly client: OpenAI;

    // Log message templates
    private readonly logTemplates = {
        error: (name: string, error: unknown) => `Error in ${name} agent: ${error}`,
        switchingModel: (from: string, to: string) => `Switching from ${from} to ${to} for thinking mode`,
    };

    // Error message templates
    private readonly errorMessages = {
        emptyResponse: 'Empty or undefined response from DeepSeek API',
        invalidFormat: 'Invalid response format from DeepSeek API',
        apiError: (error: unknown) =>
            `Failed to get response from DeepSeek API: ${error instanceof Error ? error.message : String(error)}`,
    };


    constructor(
        name: string, 
        instruction: string, 
        model: string, 
        apiKey: string, 
        temperature: number, 
        enableThinking: boolean = false,
        agentLoggingConfig: AgentLoggingConfig = DEFAULT_LOGGING_CONFIG.agents
    ) {
        super(name, instruction, model, temperature, enableThinking, agentLoggingConfig);
        this.client = new OpenAI({
            baseURL: 'https://api.deepseek.com',
            apiKey: apiKey,
        });
    }



    private convertToOpenAIMessages(messages: AIMessage[]): Array<{ role: string, content: string }> {
        const preparedMessages = this.prepareMessages(messages);
        return preparedMessages.map(msg => ({
            role: msg.role === 'developer' ? 'system' : msg.role === 'assistant' ? 'assistant' : 'user',
            content: msg.content
        }));
    }

    private addSystemInstruction(messages: Array<{ role: string, content: string }>): Array<{ role: string, content: string }> {
        // Add system instruction if no system message exists
        if (messages.length === 0 || messages[0].role !== 'system') {
            return [
                { role: 'system', content: this.instruction },
                ...messages
            ];
        }

        // Prepend instruction to existing system message
        const updatedMessages = [...messages];
        updatedMessages[0] = {
            ...updatedMessages[0],
            content: `${this.instruction}\n\n${updatedMessages[0].content}`
        };

        return updatedMessages;
    }

    /**
     * New method using Zod with DeepSeek API
     * This provides better schema handling and runtime validation
     * 
     * According to DeepSeek documentation, similar to OpenAI:
     * 1. Set response_format to { type: 'json_object' } for non-reasoning models
     * 2. For reasoning models (deepseek-reasoner), schema guidance via prompts
     */
    async askWithZodSchema<T>(zodSchema: z.ZodSchema<T>, messages: AIMessage[]): Promise<[T, string, TokenUsage?, string?]> {
        try {
            const input = this.convertToOpenAIMessages(messages);

            this.logAsking(messages);
            this.logMessages(messages);

            // For reasoning models, add schema description to prompt
            // For non-reasoning models, use JSON schema format
            let modifiedInput = [...input];
            const modelConfig = getModelConfigByApiName(this.model);
            const maxOutputTokens = Math.max(1, Math.min(modelConfig?.maxOutputTokens ?? 8192, 8192));

            let requestParams: any = {
                model: this.model,
                messages: this.addSystemInstruction(modifiedInput),
                temperature: this.temperature,
                max_tokens: maxOutputTokens,
            };

            if (this.enableThinking) {
                // For deepseek-reasoner: Add schema description to the last message
                const schemaDescription = ZodSchemaConverter.toPromptDescription(zodSchema);
                const lastMessage = modifiedInput[modifiedInput.length - 1];
                if (lastMessage && lastMessage.role === 'user') {
                    modifiedInput[modifiedInput.length - 1] = {
                        ...lastMessage,
                        content: `${lastMessage.content}\n\nYour response must be a valid JSON object matching this schema:\n${schemaDescription}`
                    };
                    requestParams.messages = this.addSystemInstruction(modifiedInput);
                }
            } else {
                // For deepseek-chat: Use JSON object format with schema description in prompt
                // DeepSeek doesn't support structured schemas like OpenAI, so we use prompt-based approach
                const schemaDescription = ZodSchemaConverter.toPromptDescription(zodSchema);
                const lastMessage = modifiedInput[modifiedInput.length - 1];
                if (lastMessage && lastMessage.role === 'user') {
                    modifiedInput[modifiedInput.length - 1] = {
                        ...lastMessage,
                        content: `${lastMessage.content}\n\nYour response must be a valid JSON object matching this schema:\n${schemaDescription}`
                    };
                    requestParams.messages = this.addSystemInstruction(modifiedInput);
                }
                requestParams.response_format = {
                    type: 'json_object'
                };
            }

            let response;
            try {
                response = await this.client.chat.completions.create(requestParams);
            } catch (apiError) {
                // Re-throw API errors immediately without wrapping them in schema validation errors
                this.logger(this.logTemplates.error(this.name, apiError));
                throw new Error(this.errorMessages.apiError(apiError));
            }

            // Extract reasoning content if available (from deepseek-reasoner)
            let thinkingContent = "";
            if (this.enableThinking && response.choices[0]?.message) {
                const reasoning = (response.choices[0].message as any).reasoning_content;
                if (reasoning) {
                    thinkingContent = reasoning;
                }
            }

            const content = response.choices[0]?.message?.content;
            if (!content) {
                throw new Error(this.errorMessages.emptyResponse);
            }

            // Parse and validate the response using Zod
            let parsedContent: unknown;
            try {
                const cleanedResponse = cleanResponse(content);
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

            // Extract token usage and calculate cost
            const usageResult = extractUsageAndCalculateCost(this.model, response);
            let tokenUsage: TokenUsage | undefined;

            if (usageResult) {
                tokenUsage = {
                    inputTokens: usageResult.usage.promptTokens,
                    outputTokens: usageResult.usage.completionTokens,
                    totalTokens: usageResult.usage.totalTokens,
                    costUSD: usageResult.cost
                };
            }

            if (validationResult.data) {
                this.logReply(validationResult.data, thinkingContent || undefined, tokenUsage);
            }

            return [validationResult.data, thinkingContent, tokenUsage];

        } catch (error) {
            this.logger(this.logTemplates.error(this.name, error));
            throw new Error(this.errorMessages.apiError(error));
        }
    }
}
