import { AbstractAgent } from "@/app/ai/abstract-agent";
import { OpenAI } from "openai";
import { AIMessage, TokenUsage, AgentLoggingConfig, DEFAULT_LOGGING_CONFIG } from "@/app/api/game-models";
import { extractUsageAndCalculateCost } from "@/app/utils/pricing";
import { z } from 'zod';
import { ZodSchemaConverter } from './zod-schema-converter';
import { parseAndValidateLlmJson } from './json-response-parser';

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
// schema constraints are conveyed in-prompt and parsed leniently.
export class MiniMaxAgent extends AbstractAgent {
    private readonly client: OpenAI;
    private readonly defaultParams: Omit<Parameters<OpenAI['chat']['completions']['create']>[0], 'messages'> = {
        model: this.model,
        temperature: this.temperature,
        stream: false,
        // MiniMax deprecates max_tokens in favor of max_completion_tokens (M3 max is 512K;
        // 16K leaves ample room for adaptive thinking plus a game answer).
        max_completion_tokens: 16384,
    };

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

    /** Defensive: with reasoning_split the content should be clean, but a stray <think> block
     *  in the answer would break JSON parsing and read badly in chat. */
    private stripThinkTags(text: string): string {
        return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
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
                costUSD: usageResult.cost
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

            const validated = this.parseAndValidate(this.stripThinkTags(reply), zodSchema);

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
     * Thinking handling and reasoning_content extraction are identical to askWithZodSchema.
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

            const cleanReply = this.stripThinkTags(reply);
            if (!cleanReply) {
                throw new Error(this.errorMessages.emptyResponse);
            }

            const { thinkingContent, tokenUsage } = this.extractThinkingAndUsage(completion);

            this.logReply(cleanReply, thinkingContent, tokenUsage);

            return [cleanReply, thinkingContent, tokenUsage];

        } catch (error) {
            this.logger(this.logTemplates.error(this.name, error));
            throw new Error(this.errorMessages.apiError(error));
        }
    }
}
