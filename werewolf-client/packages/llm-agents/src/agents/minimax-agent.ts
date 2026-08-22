import { AbstractAgent } from "./abstract-agent";
import { mergeThinking, stripInlineThinking } from "../thinking-utils";
import { OpenAI } from "openai";
import { AIMessage, TokenUsage, AgentLoggingConfig, DEFAULT_LOGGING_CONFIG } from "../types";
import { extractUsageAndCalculateCost } from "../pricing";
import { z } from 'zod';
import { ZodSchemaConverter } from '../zod-schema-converter';
import { parseAndValidateLlmJson } from '../json-response-parser';

// MiniMax M3 agent. The API is OpenAI-compatible (https://api.minimax.io/v1), so we use the
// OpenAI SDK with a custom baseURL. M3's `thinking` param is `{type: 'adaptive'}` by default
// (the model decides per-request how much to think) and `{type: 'disabled'}` turns it off.
//
// We always send `reasoning_split: true`: without it, thinking arrives as `<think>` tags INSIDE
// message.content and would poison JSON parsing; with it, thinking arrives separately in
// `message.reasoning_content` (same field as Qwen/GLM/DeepSeek). We still strip stray <think>
// blocks from the answer defensively.
//
// Structured output: the M-series Chat Completions API has no `response_format` at all, so
// schema constraints are conveyed in-prompt and parsed leniently. MiniMax's Anthropic-compatible
// endpoint was evaluated as an alternative (forced tool_choice, arguments as a parsed object) and
// rejected: it removes JSON syntax errors but MiniMax does no constrained decoding, so required
// fields are still dropped (observed live: story generation omitting a required field from all 15
// players), and tool_choice is not always honored. It needs the same in-prompt schema description
// and the same lenient parsing, for a second client against a second endpoint.
export class MiniMaxAgent extends AbstractAgent {
    private readonly client: OpenAI;
    // A getter, not a field: `maxOutputTokens` can be raised after construction, and a field
    // initializer would snapshot the default and silently ignore the override.
    private get defaultParams(): Omit<Parameters<OpenAI['chat']['completions']['create']>[0], 'messages'> {
        return {
            model: this.model,
            temperature: this.temperature,
            stream: false,
            // MiniMax deprecates max_tokens in favor of max_completion_tokens (M3 max is 512K,
            // far above anything a turn needs).
            max_completion_tokens: this.maxOutputTokens,
        };
    }

    private readonly logTemplates = {
        error: (name: string, error: unknown) => `Error in ${name} agent: ${error}`,
    };

    private readonly errorMessages = {
        emptyResponse: 'Empty or undefined response from MiniMax API',
        invalidFormat: 'Invalid response format from MiniMax API',
        apiError: (error: unknown) =>
            `Failed to get response from MiniMax API: ${error instanceof Error ? error.message : String(error)}`,
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
            baseURL: 'https://api.minimax.io/v1',
        });
    }

    private thinkingParams(): Record<string, unknown> {
        return {
            thinking: { type: this.enableThinking ? 'adaptive' : 'disabled' },
            reasoning_split: true,
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

            // No response_format on purpose: the M-series API doesn't support it, so the schema
            // is enforced in-prompt + by the lenient parser.
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

            const { text: cleanReply, thinking: inlineThinking } = stripInlineThinking(reply);
            const validated = this.parseAndValidate(cleanReply, zodSchema);

            this.logger(`✅ Response validated successfully with Zod schema`);

            const { thinkingContent: reasoningContent, tokenUsage } = this.extractThinkingAndUsage(completion);
            const thinkingContent = mergeThinking(reasoningContent, inlineThinking);

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
     * Thinking handling and reasoning_content extraction are identical to askWithZodSchema.
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

            const { text: cleanReply, thinking: inlineThinking } = stripInlineThinking(reply);
            if (!cleanReply) {
                throw new Error(this.errorMessages.emptyResponse);
            }

            const { thinkingContent: reasoningContent, tokenUsage } = this.extractThinkingAndUsage(completion);
            const thinkingContent = mergeThinking(reasoningContent, inlineThinking);

            this.logReply(cleanReply, thinkingContent, tokenUsage);

            return [cleanReply, thinkingContent, tokenUsage];

        } catch (error) {
            this.logger(this.logTemplates.error(this.name, error));
            throw new Error(this.errorMessages.apiError(error));
        }
    }
}
