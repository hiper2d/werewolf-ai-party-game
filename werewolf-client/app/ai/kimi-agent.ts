import { AbstractAgent } from "@/app/ai/abstract-agent";
import { OpenAI } from "openai";
import { AIMessage, TokenUsage, AgentLoggingConfig, DEFAULT_LOGGING_CONFIG } from "@/app/api/game-models";
import { extractUsageAndCalculateCost } from "@/app/utils/pricing";
import { z } from 'zod';
import { ZodSchemaConverter } from './zod-schema-converter';
import { parseAndValidateLlmJson } from './json-response-parser';

// Kimi K3 agent. The Moonshot API is OpenAI-compatible (https://api.moonshot.ai/v1).
//
// K3 always reasons: reasoning is on by default, and `reasoning_effort` — whose only accepted
// value today is "max" — selects the level. We send it explicitly so the model stays pinned at
// max should Moonshot ship lower levels with a different default. Sending it is otherwise a no-op.
//
// The K2-era `thinking: { type: 'disabled' }` toggle does still suppress reasoning on kimi-k3,
// but it is undocumented for K3 and could disappear without notice, so we don't rely on it: this
// agent has a single always-reasoning mode. Reasoning surfaces as `message.reasoning_content`,
// counted in `usage.completion_tokens_details.reasoning_tokens` (already part of completion_tokens).
export class KimiAgent extends AbstractAgent {
    private readonly client: OpenAI;
    // kimi-k3 rejects any temperature other than 1, so we never send the field.
    private readonly defaultParams: Omit<Parameters<OpenAI['chat']['completions']['create']>[0], 'messages'> = {
        model: this.model,
        stream: false,
        max_tokens: 16384,  // Set to 16k to handle longer JSON responses
        // Moonshot's only accepted level; "max" is not in the OpenAI SDK's ReasoningEffort union.
        reasoning_effort: 'max' as any,
    };

    // Log message templates
    private readonly logTemplates = {
        error: (name: string, error: unknown) => `Error in ${name} agent: ${error}`,
    };

    // Error message templates
    private readonly errorMessages = {
        emptyResponse: 'Empty or undefined response from Kimi API',
        invalidFormat: 'Invalid response format from Kimi API',
        apiError: (error: unknown) =>
            `Failed to get response from Kimi API: ${error instanceof Error ? error.message : String(error)}`,
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
            apiKey: apiKey,
            baseURL: 'https://api.moonshot.ai/v1',
        });
    }




    private convertToOpenAIMessages(messages: AIMessage[]): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
        return messages.map(msg => ({
            role: msg.role as 'system' | 'user' | 'assistant',
            content: msg.content
        }));
    }

    private extractThinkingAndUsage(
        completion: OpenAI.Chat.Completions.ChatCompletion
    ): { thinkingContent: string; tokenUsage?: TokenUsage } {
        let thinkingContent = "";
        const message = completion.choices[0]?.message as any;

        if (message?.reasoning_content) {
            thinkingContent = message.reasoning_content;
            this.logger(`Captured reasoning_content (${thinkingContent.length} characters)`);
        }

        let tokenUsage: TokenUsage | undefined;
        const usageResult = extractUsageAndCalculateCost(this.model, completion);

        if (usageResult) {
            const reasoningTokens = usageResult.usage.reasoningTokens;

            tokenUsage = {
                inputTokens: usageResult.usage.promptTokens,
                outputTokens: usageResult.usage.completionTokens,
                totalTokens: usageResult.usage.totalTokens,
                costUSD: usageResult.cost,
                // Only present when reasoning ran; the key is omitted otherwise so we never
                // hand Firestore an undefined value.
                ...(reasoningTokens ? { reasoningTokens } : {})
            };

            if (reasoningTokens) {
                const finalAnswerTokens = Math.max(0, tokenUsage.outputTokens - reasoningTokens);
                this.logger(
                    `Output breakdown: ${reasoningTokens} reasoning tokens, ${finalAnswerTokens} final answer tokens`
                );
            }
        }

        return { thinkingContent, tokenUsage };
    }

    /**
     * New method using Zod with Kimi/Moonshot AI API
     * This provides better schema handling and runtime validation
     * 
     * Kimi/Moonshot AI API is OpenAI-compatible, so we try JSON mode first,
     * and fall back to prompt-based schema if not supported
     */
    async askWithZodSchema<T>(zodSchema: z.ZodSchema<T>, messages: AIMessage[]): Promise<[T, string, TokenUsage?, string?]> {
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

            this.logAsking(messages);
            this.logMessages(messages);

            // First, try with JSON mode (OpenAI-compatible)
            try {
                const kimiSchema = ZodSchemaConverter.toOpenAIJsonSchema(zodSchema, 'response_schema');

                let completion;
                try {
                    const params: any = {
                        ...this.defaultParams,
                        messages: openAIMessages,
                        response_format: {
                            type: 'json_schema',
                            json_schema: kimiSchema
                        }
                    };

                    completion = await this.client.chat.completions.create(params) as OpenAI.Chat.Completions.ChatCompletion;
                } catch (apiError) {
                    // Re-throw API errors immediately without wrapping them in schema validation errors
                    this.logger(this.logTemplates.error(this.name, apiError));
                    throw new Error(this.errorMessages.apiError(apiError));
                }

                const reply = completion.choices[0]?.message?.content;
                if (!reply) {
                    throw new Error(this.errorMessages.emptyResponse);
                }

                // Parse and validate the response using the shared lenient parser
                const parsedData = parseAndValidateLlmJson(reply, zodSchema, (m) => this.logger(m));

                this.logger(`✅ Response validated successfully with Zod schema (JSON mode)`);

                const { thinkingContent, tokenUsage } = this.extractThinkingAndUsage(completion);

                if (parsedData) {
                    this.logReply(parsedData, thinkingContent, tokenUsage);
                }

                return [parsedData, thinkingContent, tokenUsage];

            } catch (jsonModeError) {
                // If JSON mode fails, fall back to prompt-based schema
                this.logger(`JSON mode failed, falling back to prompt-based schema: ${jsonModeError}`);

                const schemaDescription = ZodSchemaConverter.toPromptDescription(zodSchema);
                const lastMessage = openAIMessages[openAIMessages.length - 1];

                if (lastMessage) {
                    lastMessage.content += `\n\nYour response must be a valid JSON object matching this schema:\n${schemaDescription}`;
                }

                let completion;
                try {
                    const params: any = {
                        ...this.defaultParams,
                        messages: openAIMessages
                    };

                    completion = await this.client.chat.completions.create(params) as OpenAI.Chat.Completions.ChatCompletion;
                } catch (apiError) {
                    // Re-throw API errors immediately without wrapping them in schema validation errors
                    this.logger(this.logTemplates.error(this.name, apiError));
                    throw new Error(this.errorMessages.apiError(apiError));
                }

                const reply = completion.choices[0]?.message?.content;
                if (!reply) {
                    throw new Error(this.errorMessages.emptyResponse);
                }

                // Parse and validate the response using the shared lenient parser
                const parsedData = parseAndValidateLlmJson(reply, zodSchema, (m) => this.logger(m));

                this.logger(`✅ Response validated successfully with Zod schema (prompt mode)`);

                const { thinkingContent, tokenUsage } = this.extractThinkingAndUsage(completion);

                if (parsedData) {
                    this.logReply(parsedData, thinkingContent, tokenUsage);
                }

                return [parsedData, thinkingContent, tokenUsage];
            }

        } catch (error) {
            this.logger(this.logTemplates.error(this.name, error));
            throw new Error(this.errorMessages.apiError(error));
        }
    }

    /**
     * Plain-text ask: no JSON mode (and therefore no prompt-based schema fallback).
     * Thinking toggle and reasoning_content extraction are identical to askWithZodSchema.
     */
    async askText(messages: AIMessage[]): Promise<[string, string, TokenUsage?, string?]> {
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

            this.logAsking(messages);
            this.logMessages(messages);

            let completion;
            try {
                const params: any = {
                    ...this.defaultParams,
                    messages: openAIMessages
                };

                completion = await this.client.chat.completions.create(params) as OpenAI.Chat.Completions.ChatCompletion;
            } catch (apiError) {
                this.logger(this.logTemplates.error(this.name, apiError));
                throw new Error(this.errorMessages.apiError(apiError));
            }

            const reply = completion.choices[0]?.message?.content;
            if (!reply) {
                throw new Error(this.errorMessages.emptyResponse);
            }

            const { thinkingContent, tokenUsage } = this.extractThinkingAndUsage(completion);

            this.logReply(reply, thinkingContent, tokenUsage);

            return [reply, thinkingContent, tokenUsage];

        } catch (error) {
            this.logger(this.logTemplates.error(this.name, error));
            throw new Error(this.errorMessages.apiError(error));
        }
    }
}
