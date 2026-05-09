import { AbstractAgent } from "@/app/ai/abstract-agent";
import { OpenAI } from "openai";
import { AIMessage, TokenUsage, AgentLoggingConfig, DEFAULT_LOGGING_CONFIG } from "@/app/api/game-models";
import { cleanResponse } from "@/app/utils/message-utils";
import { extractUsageAndCalculateCost } from "@/app/utils/pricing";
import { z } from 'zod';
import { ZodSchemaConverter } from './zod-schema-converter';
import { safeValidateResponse } from './prompts/zod-schemas';

// Z.AI / GLM-5.1 agent. The API is OpenAI-compatible (https://api.z.ai/api/paas/v4/),
// so we use the OpenAI SDK with a custom baseURL. GLM-5.1 supports a thinking toggle
// via `thinking: { type: 'enabled' | 'disabled' }`, identical to Kimi K2.6.
export class GlmAgent extends AbstractAgent {
    private readonly client: OpenAI;
    private readonly defaultParams: Omit<Parameters<OpenAI['chat']['completions']['create']>[0], 'messages'> = {
        model: this.model,
        temperature: this.temperature,
        stream: false,
        max_tokens: 16384,
    };

    private readonly logTemplates = {
        error: (name: string, error: unknown) => `Error in ${name} agent: ${error}`,
    };

    private readonly errorMessages = {
        emptyResponse: 'Empty or undefined response from Z.AI API',
        invalidFormat: 'Invalid response format from Z.AI API',
        apiError: (error: unknown) =>
            `Failed to get response from Z.AI API: ${error instanceof Error ? error.message : String(error)}`,
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
            baseURL: 'https://api.z.ai/api/paas/v4/',
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
     * Try to extract the first balanced JSON object embedded in `text`.
     * Naive brace-depth scanner — good enough when the model wraps JSON in prose.
     * Returns null when no parseable object is found.
     */
    private extractEmbeddedJson(text: string): unknown | null {
        const start = text.indexOf('{');
        if (start < 0) return null;
        let depth = 0;
        for (let i = start; i < text.length; i++) {
            const ch = text[i];
            if (ch === '{') depth++;
            else if (ch === '}') {
                depth--;
                if (depth === 0) {
                    const slice = text.slice(start, i + 1);
                    try { return JSON.parse(slice); } catch { return null; }
                }
            }
        }
        return null;
    }

    /**
     * Robust schema-aware coercion of a model reply.
     * Order: strict JSON parse → embedded {…} extraction → wrap-as-reply (BotAnswer-shaped schemas).
     * Returns the validated value or throws.
     */
    private parseAndValidate<T>(rawReply: string, zodSchema: z.ZodSchema<T>): T {
        const cleaned = cleanResponse(rawReply);

        // 1. Strict JSON parse
        try {
            const parsed = JSON.parse(cleaned);
            const result = safeValidateResponse(zodSchema, parsed);
            if (result.success) return result.data;
        } catch { /* fall through to extraction */ }

        // 2. Extract first balanced {...} from prose
        const extracted = this.extractEmbeddedJson(cleaned);
        if (extracted !== null) {
            const result = safeValidateResponse(zodSchema, extracted);
            if (result.success) {
                this.logger(`Recovered JSON from prose-wrapped response (${cleaned.length} chars)`);
                return result.data;
            }
        }

        // 3. Last resort: wrap raw prose as `{reply: ...}` if the schema accepts it.
        // This rescues bot dialogue when the model "speaks in character" instead of returning JSON.
        const wrapped = safeValidateResponse(zodSchema, { reply: cleaned });
        if (wrapped.success) {
            this.logger(`Wrapped prose as BotAnswer reply (${cleaned.length} chars)`);
            return wrapped.data;
        }

        throw new Error(`Failed to parse JSON response: model did not return valid JSON or BotAnswer-compatible prose. First 200 chars: ${cleaned.slice(0, 200)}`);
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

            // Z.AI's JSON mode is `{ type: 'json_object' }` (OpenAI's older shape) — it does NOT
            // accept `{ type: 'json_schema', json_schema: ... }`. Schema constraints must be
            // conveyed in-prompt. See https://docs.z.ai → Structured Output.
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
                    response_format: { type: 'json_object' },
                    thinking: { type: this.enableThinking ? 'enabled' : 'disabled' }
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
}
