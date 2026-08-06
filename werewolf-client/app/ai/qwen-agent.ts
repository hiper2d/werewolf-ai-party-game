import { AbstractAgent } from "@/app/ai/abstract-agent";
import { OpenAI } from "openai";
import { AIMessage, TokenUsage, AgentLoggingConfig, DEFAULT_LOGGING_CONFIG } from "@/app/api/game-models";
import { getModelConfigByApiName } from "@/app/ai/ai-models";
import { extractUsageAndCalculateCost } from "@/app/utils/pricing";
import { z } from 'zod';
import { ZodSchemaConverter } from './zod-schema-converter';
import { parseAndValidateLlmJson } from './json-response-parser';

// Qwen (QwenCloud/DashScope) agent. The API is OpenAI-compatible
// (https://dashscope-intl.aliyuncs.com/compatible-mode/v1), so we use the OpenAI SDK with a
// custom baseURL. Thinking is toggled with a top-level `enable_thinking` boolean and arrives in
// `message.reasoning_content` — verified live 2026-08-05 against qwen3.8-max / 3.7-plus /
// 3.7-flash, all of which accept non-streaming thinking requests.
//
// Structured output: Qwen's `response_format: json_object` is NOT supported in thinking mode,
// and we always think — so schema constraints are conveyed in-prompt and parsed leniently,
// never via response_format.
export class QwenAgent extends AbstractAgent {
    private readonly client: OpenAI;
    private readonly defaultParams: Omit<Parameters<OpenAI['chat']['completions']['create']>[0], 'messages'> = {
        model: this.model,
        temperature: this.temperature,
        stream: false,
        // Reasoning tokens share the completion budget on Qwen, so leave room for both CoT and
        // answer. Do not shrink this: a truncated response cuts the JSON mid-object.
        max_tokens: 16384,
    };

    private readonly logTemplates = {
        error: (name: string, error: unknown) => `Error in ${name} agent: ${error}`,
    };

    private readonly errorMessages = {
        emptyResponse: 'Empty or undefined response from Qwen API',
        invalidFormat: 'Invalid response format from Qwen API',
        apiError: (error: unknown) =>
            `Failed to get response from Qwen API: ${error instanceof Error ? error.message : String(error)}`,
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
            baseURL: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
        });
    }

    /**
     * Thinking params for the request body. `thinking_budget` caps reasoning length and is only
     * sent when the model's config sets `thinkingBudgetTokens` (qwen3.8-max's latency swings
     * 30–100s uncapped); models without it think at the provider default.
     */
    private thinkingParams(): Record<string, unknown> {
        const budget = getModelConfigByApiName(this.model, this.enableThinking)?.thinkingBudgetTokens;
        return {
            enable_thinking: this.enableThinking,
            ...(this.enableThinking && budget !== undefined ? { thinking_budget: budget } : {}),
        };
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

        if (this.enableThinking && message?.reasoning_content) {
            thinkingContent = message.reasoning_content;
            this.logger(`Captured reasoning_content (${thinkingContent.length} characters)`);
        }

        let tokenUsage: TokenUsage | undefined;
        const usageResult = extractUsageAndCalculateCost(this.model, completion);

        if (usageResult) {
            tokenUsage = {
                inputTokens: usageResult.usage.promptTokens,
                outputTokens: usageResult.usage.completionTokens,
                totalTokens: usageResult.usage.totalTokens,
                costUSD: usageResult.cost,
                ...(usageResult.usage.cacheHitTokens !== undefined ? { cachedInputTokens: usageResult.usage.cacheHitTokens } : {})
            };

            if (this.enableThinking && usageResult.usage.reasoningTokens) {
                const reasoningTokens = usageResult.usage.reasoningTokens;
                const finalAnswerTokens = Math.max(0, tokenUsage.outputTokens - reasoningTokens);
                this.logger(
                    `Output breakdown: ${reasoningTokens} reasoning tokens, ${finalAnswerTokens} final answer tokens`
                );
            }
        }

        return { thinkingContent, tokenUsage };
    }

    /**
     * Robust schema-aware coercion of a model reply.
     * Order: strict JSON parse → embedded {…} extraction → wrap-as-reply (BotAnswer-shaped schemas).
     * Returns the validated value or throws.
     */
    private parseAndValidate<T>(rawReply: string, zodSchema: z.ZodSchema<T>): T {
        return parseAndValidateLlmJson(rawReply, zodSchema, (m) => this.logger(m));
    }

    async doAskWithZodSchema<T>(zodSchema: z.ZodSchema<T>, messages: AIMessage[]): Promise<[T, string, TokenUsage?, string?]> {
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

            // No response_format here on purpose: Qwen rejects JSON mode when thinking is
            // enabled, so the schema is enforced in-prompt + by the lenient parser.
            const schemaDescription = ZodSchemaConverter.toPromptDescription(zodSchema);
            const lastMessage = openAIMessages[openAIMessages.length - 1];
            if (lastMessage) {
                lastMessage.content += `\n\nIMPORTANT: Respond with ONLY a valid JSON object matching this schema. Do NOT write narration, roleplay actions, asterisks, or commentary outside the JSON. Output the JSON object and nothing else.\n${schemaDescription}`;
            }

            let completion;
            try {
                const params: any = {
                    ...this.defaultParams,
                    messages: openAIMessages,
                    ...this.thinkingParams()
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

            const validated = this.parseAndValidate(reply, zodSchema);

            this.logger(`✅ Response validated successfully with Zod schema`);

            const { thinkingContent, tokenUsage } = this.extractThinkingAndUsage(completion);

            if (validated) {
                this.logReply(validated, thinkingContent, tokenUsage);
            }

            return [validated, thinkingContent, tokenUsage];

        } catch (error) {
            this.logger(this.logTemplates.error(this.name, error));
            throw new Error(this.errorMessages.apiError(error));
        }
    }

    /**
     * Plain-text ask: no schema appended to the prompt.
     * Thinking toggle and reasoning_content extraction are identical to askWithZodSchema.
     */
    async doAskText(messages: AIMessage[]): Promise<[string, string, TokenUsage?, string?]> {
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
                    messages: openAIMessages,
                    ...this.thinkingParams()
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
