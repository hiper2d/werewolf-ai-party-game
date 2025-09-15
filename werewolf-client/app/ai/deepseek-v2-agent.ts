import {AbstractAgent} from "@/app/ai/abstract-agent";
import OpenAI from "openai";
import {AIMessage, TokenUsage} from "@/app/api/game-models";
import {ResponseSchema} from "@/app/ai/prompts/ai-schemas";
import {cleanResponse} from "@/app/utils/message-utils";
import {extractUsageAndCalculateCost} from "@/app/utils/pricing";
import { z } from 'zod';
import { ZodSchemaConverter } from './zod-schema-converter';
import { safeValidateResponse } from './prompts/zod-schemas';

export class DeepSeekV2Agent extends AbstractAgent {
    private readonly client: OpenAI;

    // Log message templates
    private readonly logTemplates = {
        askingAgent: (name: string, model: string) => `Asking ${name} ${model} agent`,
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

    // Schema instruction template
    private readonly schemaTemplate = {
        instructions: (schema: ResponseSchema) =>
            `Your response must be a valid JSON object matching this schema:
${JSON.stringify(schema, null, 2)}

Ensure your response strictly follows the schema requirements.`,
    };

    constructor(name: string, instruction: string, model: string, apiKey: string, temperature: number, enableThinking: boolean = false) {
        super(name, instruction, model, temperature, enableThinking);
        this.client = new OpenAI({
            baseURL: 'https://api.deepseek.com',
            apiKey: apiKey,
        });
    }


    protected async doAskWithSchema(schema: ResponseSchema, messages: AIMessage[]): Promise<[string, string, TokenUsage?]> {
        try {
            const input = this.convertToOpenAIMessages(messages);

            this.logger(this.logTemplates.askingAgent(this.name, this.model));
            
            // Add schema instructions to the last message
            const schemaInstructions = this.schemaTemplate.instructions(schema);
            const modifiedInput = [...input];
            const lastMessage = modifiedInput[modifiedInput.length - 1];
            if (lastMessage && lastMessage.role === 'user') {
                modifiedInput[modifiedInput.length - 1] = {
                    ...lastMessage,
                    content: `${lastMessage.content}\n\n${schemaInstructions}`
                };
            }

            const requestParams: any = {
                model: this.model,
                messages: this.addSystemInstruction(modifiedInput),
                temperature: this.temperature,
            };

            // Add JSON format instruction for deepseek-chat (but not for deepseek-reasoner)
            if (!this.enableThinking) {
                requestParams.response_format = { type: 'json_object' };
            }

            const response = await this.client.chat.completions.create(requestParams);

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

            return [cleanResponse(content), thinkingContent, tokenUsage];
        } catch (error) {
            this.logger(this.logTemplates.error(this.name, error));
            throw new Error(this.errorMessages.apiError(error));
        }
    }

    private convertToOpenAIMessages(messages: AIMessage[]): Array<{role: string, content: string}> {
        const preparedMessages = this.prepareMessages(messages);
        return preparedMessages.map(msg => ({
            role: msg.role === 'developer' ? 'system' : msg.role === 'assistant' ? 'assistant' : 'user',
            content: msg.content
        }));
    }

    private addSystemInstruction(messages: Array<{role: string, content: string}>): Array<{role: string, content: string}> {
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
    async askWithZodSchema<T>(zodSchema: z.ZodSchema<T>, messages: AIMessage[]): Promise<[T, string, TokenUsage?]> {
        try {
            const input = this.convertToOpenAIMessages(messages);
            
            this.logger(this.logTemplates.askingAgent(this.name, this.model));
            
            // For reasoning models, add schema description to prompt
            // For non-reasoning models, use JSON schema format
            let modifiedInput = [...input];
            let requestParams: any = {
                model: this.model,
                messages: this.addSystemInstruction(modifiedInput),
                temperature: this.temperature,
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
                // For deepseek-chat: Use JSON schema format
                const deepseekSchema = ZodSchemaConverter.toMistralSchema(zodSchema);
                requestParams.response_format = {
                    type: 'json_object',
                    schema: deepseekSchema
                };
            }

            const response = await this.client.chat.completions.create(requestParams);

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

            return [validationResult.data, thinkingContent, tokenUsage];
            
        } catch (error) {
            this.logger(this.logTemplates.error(this.name, error));
            throw new Error(this.errorMessages.apiError(error));
        }
    }
}