import {AbstractAgent} from "@/app/ai/abstract-agent";
import {OpenAI} from "openai";
import {AIMessage, TokenUsage} from "@/app/api/game-models";
import {ResponseSchema} from "@/app/ai/prompts/ai-schemas";
import {cleanResponse} from "@/app/utils/message-utils";
import {extractUsageAndCalculateCost} from "@/app/utils/pricing";
import { z } from 'zod';
import { ZodSchemaConverter } from './zod-schema-converter';
import { safeValidateResponse } from './prompts/zod-schemas';

export class KimiAgent extends AbstractAgent {
    private readonly client: OpenAI;
    private readonly defaultParams: Omit<Parameters<OpenAI['chat']['completions']['create']>[0], 'messages'> = {
        model: this.model,
        temperature: this.temperature,
        stream: false,
    };

    // Log message templates
    private readonly logTemplates = {
        askingAgent: (name: string, model: string) => `Asking ${name} ${model} agent`,
        error: (name: string, error: unknown) => `Error in ${name} agent: ${error}`,
    };

    // Error message templates
    private readonly errorMessages = {
        emptyResponse: 'Empty or undefined response from Kimi API',
        invalidFormat: 'Invalid response format from Kimi API',
        apiError: (error: unknown) =>
            `Failed to get response from Kimi API: ${error instanceof Error ? error.message : String(error)}`,
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
            apiKey: apiKey,
            baseURL: 'https://api.moonshot.ai/v1',
        });
    }


    protected async doAskWithSchema(schema: ResponseSchema, messages: AIMessage[]): Promise<[string, string, TokenUsage?]> {
        const schemaInstructions = this.schemaTemplate.instructions(schema);
        const lastMessage = messages[messages.length - 1];
        const fullPrompt = `${lastMessage.content}\n\n${schemaInstructions}`;
        const modifiedMessages = [
            ...messages.slice(0, -1),
            { ...lastMessage, content: fullPrompt }
        ];

        try {
            const preparedMessages = this.prepareMessagesWithInstruction(modifiedMessages);
            const completion = await this.client.chat.completions.create({
                ...this.defaultParams,
                messages: preparedMessages,
            }) as OpenAI.Chat.Completions.ChatCompletion;

            return this.processReply(completion);
        } catch (error) {
            this.logger(this.logTemplates.error(this.name, error));
            throw new Error(this.errorMessages.apiError(error));
        }
    }

    private prepareMessagesWithInstruction(messages: AIMessage[]): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
        const preparedMessages = this.prepareMessages(messages);
        if (preparedMessages.length > 0) {
            preparedMessages[0].content = `${this.instruction}\n\n${preparedMessages[0].content}`;
        }
        return this.convertToOpenAIMessages(preparedMessages);
    }

    private convertToOpenAIMessages(messages: AIMessage[]): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
        return messages.map(msg => ({
            role: msg.role as 'system' | 'user' | 'assistant',
            content: msg.content
        }));
    }

    private processReply(completion: OpenAI.Chat.Completions.ChatCompletion): [string, string, TokenUsage?] {
        const reply = completion.choices[0]?.message?.content;

        if (!reply) {
            throw new Error(this.errorMessages.emptyResponse);
        }

        // Extract token usage and calculate cost
        const usageResult = extractUsageAndCalculateCost(this.model, completion);
        let tokenUsage: TokenUsage | undefined;
        
        if (usageResult) {
            tokenUsage = {
                inputTokens: usageResult.usage.promptTokens,
                outputTokens: usageResult.usage.completionTokens,
                totalTokens: usageResult.usage.totalTokens,
                costUSD: usageResult.cost
            };
        }

        return [cleanResponse(reply), "", tokenUsage];
    }

    /**
     * New method using Zod with Kimi/Moonshot AI API
     * This provides better schema handling and runtime validation
     * 
     * Kimi/Moonshot AI API is OpenAI-compatible, so we try JSON mode first,
     * and fall back to prompt-based schema if not supported
     */
    async askWithZodSchema<T>(zodSchema: z.ZodSchema<T>, messages: AIMessage[]): Promise<[T, string, TokenUsage?]> {
        try {
            const preparedMessages = this.prepareMessages(messages);
            const openAIMessages = this.convertToOpenAIMessages(preparedMessages);
            
            // Add system instruction if needed
            if (openAIMessages.length > 0 && openAIMessages[0].role !== 'system') {
                openAIMessages.unshift({
                    role: 'system',
                    content: this.instruction
                });
            } else if (openAIMessages.length > 0 && openAIMessages[0].role === 'system') {
                openAIMessages[0].content = `${this.instruction}\n\n${openAIMessages[0].content}`;
            }

            this.logger(this.logTemplates.askingAgent(this.name, this.model));

            // First, try with JSON mode (OpenAI-compatible)
            try {
                const kimiSchema = ZodSchemaConverter.toOpenAIJsonSchema(zodSchema, 'response_schema');
                
                const completion = await this.client.chat.completions.create({
                    ...this.defaultParams,
                    messages: openAIMessages,
                    response_format: { 
                        type: 'json_schema',
                        json_schema: kimiSchema
                    }
                }) as OpenAI.Chat.Completions.ChatCompletion;

                const reply = completion.choices[0]?.message?.content;
                if (!reply) {
                    throw new Error(this.errorMessages.emptyResponse);
                }

                // Parse and validate using Zod
                let parsedContent: unknown;
                try {
                    const cleanedResponse = cleanResponse(reply);
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

                this.logger(`✅ Response validated successfully with Zod schema (JSON mode)`);

                // Extract token usage
                const usageResult = extractUsageAndCalculateCost(this.model, completion);
                let tokenUsage: TokenUsage | undefined;
                
                if (usageResult) {
                    tokenUsage = {
                        inputTokens: usageResult.usage.promptTokens,
                        outputTokens: usageResult.usage.completionTokens,
                        totalTokens: usageResult.usage.totalTokens,
                        costUSD: usageResult.cost
                    };
                }

                return [validationResult.data, "", tokenUsage];

            } catch (jsonModeError) {
                // If JSON mode fails, fall back to prompt-based schema
                this.logger(`JSON mode failed, falling back to prompt-based schema: ${jsonModeError}`);
                
                const schemaDescription = ZodSchemaConverter.toPromptDescription(zodSchema);
                const lastMessage = openAIMessages[openAIMessages.length - 1];
                
                if (lastMessage) {
                    lastMessage.content += `\n\nYour response must be a valid JSON object matching this schema:\n${schemaDescription}`;
                }

                const completion = await this.client.chat.completions.create({
                    ...this.defaultParams,
                    messages: openAIMessages
                }) as OpenAI.Chat.Completions.ChatCompletion;

                const reply = completion.choices[0]?.message?.content;
                if (!reply) {
                    throw new Error(this.errorMessages.emptyResponse);
                }

                // Parse and validate using Zod
                let parsedContent: unknown;
                try {
                    const cleanedResponse = cleanResponse(reply);
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

                this.logger(`✅ Response validated successfully with Zod schema (prompt mode)`);

                // Extract token usage
                const usageResult = extractUsageAndCalculateCost(this.model, completion);
                let tokenUsage: TokenUsage | undefined;
                
                if (usageResult) {
                    tokenUsage = {
                        inputTokens: usageResult.usage.promptTokens,
                        outputTokens: usageResult.usage.completionTokens,
                        totalTokens: usageResult.usage.totalTokens,
                        costUSD: usageResult.cost
                    };
                }

                return [validationResult.data, "", tokenUsage];
            }

        } catch (error) {
            this.logger(this.logTemplates.error(this.name, error));
            throw new Error(this.errorMessages.apiError(error));
        }
    }
}