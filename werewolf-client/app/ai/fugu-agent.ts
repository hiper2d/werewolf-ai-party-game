import { AbstractAgent } from "@/app/ai/abstract-agent";
import { OpenAI } from "openai";
import { AIMessage, TokenUsage, AgentLoggingConfig, DEFAULT_LOGGING_CONFIG } from "@/app/api/game-models";
import { extractUsageAndCalculateCost } from "@/app/utils/pricing";
import { logger } from "@/app/utils/logger";
import { z } from 'zod';
import { ZodSchemaConverter } from './zod-schema-converter';
import { parseAndValidateLlmJson } from './json-response-parser';

// Sakana Fugu agent. The API is OpenAI-compatible (https://api.sakana.ai/v1), so we use the
// OpenAI SDK with a custom baseURL. Both `fugu` and `fugu-ultra` always reason; the API exposes
// two effort levels ("high" — the default — and "xhigh"/"max"). We expose a single picker entry
// per model at the default "high" effort, so we do NOT send `reasoning_effort` (omitting it keeps
// the request minimal and avoids param-rejection on this endpoint; "high" is applied by default).
// Reasoning content, when returned, surfaces as `message.reasoning_content` (OpenAI-compatible).
export class FuguAgent extends AbstractAgent {
    private readonly client: OpenAI;
    private readonly defaultParams: Omit<Parameters<OpenAI['chat']['completions']['create']>[0], 'messages'> = {
        model: this.model,
        stream: false,
        max_tokens: 16384, // Cap visible output to match every other agent (16k). Server-side
                           // orchestration/reasoning tokens are separate and unaffected by this.
    };

    private readonly logTemplates = {
        error: (name: string, error: unknown) => `Error in ${name} agent: ${error}`,
    };

    private readonly errorMessages = {
        emptyResponse: 'Empty or undefined response from Sakana Fugu API',
        invalidFormat: 'Invalid response format from Sakana Fugu API',
        apiError: (error: unknown) =>
            `Failed to get response from Sakana Fugu API: ${error instanceof Error ? error.message : String(error)}`,
    };

    constructor(
        name: string,
        instruction: string,
        model: string,
        apiKey: string,
        enableThinking: boolean = false,
        agentLoggingConfig: AgentLoggingConfig = DEFAULT_LOGGING_CONFIG.agents
    ) {
        // Fugu is a reasoning model and ignores temperature, so we pass a neutral default upstream.
        super(name, instruction, model, 1, enableThinking, agentLoggingConfig);
        this.client = new OpenAI({
            apiKey: apiKey,
            baseURL: 'https://api.sakana.ai/v1',
            timeout: 1200000,
        });
    }

    private convertToOpenAIMessages(messages: AIMessage[]): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
        return messages.map(msg => ({
            role: msg.role as 'system' | 'user' | 'assistant',
            content: msg.content
        }));
    }

    // ───────────────────────────────────────────────────────────────────────────────────────
    // TEMPORARY (cost calibration). Base `fugu` is a dynamic router with no published per-token
    // price and Sakana returns NO cost field in the response — only token counts. Crucially the
    // response also reports "orchestration tokens" (billed at input/output rates per Sakana's
    // pricing page) that our standard TokenUsage drops. This logs the full raw breakdown to
    // BetterStack under a distinctive tag so we can sum real tokens per game and, combined with
    // the Sakana billing dashboard total, derive the true per-token rate. REMOVE AFTER CALIBRATION.
    private logRawUsageForCalibration(completion: OpenAI.Chat.Completions.ChatCompletion): void {
        const usage: any = completion?.usage;
        if (!usage) return;
        logger.info('FUGU_COST_CALIBRATION', {
            tag: 'FUGU_COST_CALIBRATION',
            model: this.model,
            agentName: this.name,
            gameId: this.gameId,
            userId: this.userId,
            promptTokens: usage.prompt_tokens ?? 0,
            completionTokens: usage.completion_tokens ?? 0,
            totalTokens: usage.total_tokens ?? 0,
            cachedTokens: usage.prompt_tokens_details?.cached_tokens ?? 0,
            orchestrationInputTokens: usage.prompt_tokens_details?.orchestration_input_tokens ?? 0,
            orchestrationInputCachedTokens: usage.prompt_tokens_details?.orchestration_input_cached_tokens ?? 0,
            reasoningTokens: usage.completion_tokens_details?.reasoning_tokens ?? 0,
            orchestrationOutputTokens: usage.completion_tokens_details?.orchestration_output_tokens ?? 0,
            rawUsage: usage,
        });
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
            tokenUsage = {
                inputTokens: usageResult.usage.promptTokens,
                outputTokens: usageResult.usage.completionTokens,
                totalTokens: usageResult.usage.totalTokens,
                costUSD: usageResult.cost
            };

            if (usageResult.usage.reasoningTokens) {
                const reasoningTokens = usageResult.usage.reasoningTokens;
                const finalAnswerTokens = Math.max(0, tokenUsage.outputTokens - reasoningTokens);
                this.logger(
                    `Output breakdown: ${reasoningTokens} reasoning tokens, ${finalAnswerTokens} final answer tokens`
                );
            }
        }

        return { thinkingContent, tokenUsage };
    }

    private prependSystemInstruction(openAIMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]): void {
        if (openAIMessages.length > 0 && openAIMessages[0].role !== 'system') {
            openAIMessages.unshift({ role: 'system', content: this.instruction });
        } else if (openAIMessages.length > 0 && openAIMessages[0].role === 'system') {
            openAIMessages[0].content = `${this.instruction}\n\n${openAIMessages[0].content}`;
        }
    }

    async askWithZodSchema<T>(zodSchema: z.ZodSchema<T>, messages: AIMessage[]): Promise<[T, string, TokenUsage?, string?]> {
        try {
            const preparedMessages = this.prepareMessages(messages);
            const openAIMessages = this.convertToOpenAIMessages(preparedMessages);
            this.prependSystemInstruction(openAIMessages);

            // Sakana's docs don't advertise structured output, but probing the live API shows it
            // accepts OpenAI's `json_object` mode (returns clean JSON; without it the model wraps
            // replies in ```json fences). We use json_object for a clean reply and still describe
            // the schema in-prompt for shape, parsing with the shared lenient parser. (Strict
            // `json_schema` mode also works but is avoided — like GlmAgent/GrokAgent — since the
            // game's optional/union Zod schemas don't satisfy strict-mode requirements.)
            const schemaDescription = ZodSchemaConverter.toPromptDescription(zodSchema);
            const lastMessage = openAIMessages[openAIMessages.length - 1];
            if (lastMessage) {
                lastMessage.content += `\n\nIMPORTANT: Respond with ONLY a valid JSON object matching this schema. Do NOT write narration, roleplay actions, asterisks, or commentary outside the JSON. Output the JSON object and nothing else.\n${schemaDescription}`;
            }

            this.logAsking(messages);
            this.logMessages(messages);

            let completion;
            try {
                const params: any = {
                    ...this.defaultParams,
                    messages: openAIMessages,
                    response_format: { type: 'json_object' },
                };
                completion = await this.client.chat.completions.create(params) as OpenAI.Chat.Completions.ChatCompletion;
            } catch (apiError) {
                this.logger(this.logTemplates.error(this.name, apiError));
                throw new Error(this.errorMessages.apiError(apiError));
            }

            this.logRawUsageForCalibration(completion); // TEMPORARY — remove after cost calibration

            const reply = completion.choices[0]?.message?.content;
            if (!reply) {
                throw new Error(this.errorMessages.emptyResponse);
            }

            const validated = parseAndValidateLlmJson(reply, zodSchema, (m) => this.logger(m));

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
     * Plain-text ask: no schema appended to the prompt. Reasoning extraction and token
     * accounting are identical to askWithZodSchema.
     */
    async askText(messages: AIMessage[]): Promise<[string, string, TokenUsage?, string?]> {
        try {
            const preparedMessages = this.prepareMessages(messages);
            const openAIMessages = this.convertToOpenAIMessages(preparedMessages);
            this.prependSystemInstruction(openAIMessages);

            this.logAsking(messages);
            this.logMessages(messages);

            let completion;
            try {
                const params: any = {
                    ...this.defaultParams,
                    messages: openAIMessages,
                };
                completion = await this.client.chat.completions.create(params) as OpenAI.Chat.Completions.ChatCompletion;
            } catch (apiError) {
                this.logger(this.logTemplates.error(this.name, apiError));
                throw new Error(this.errorMessages.apiError(apiError));
            }

            this.logRawUsageForCalibration(completion); // TEMPORARY — remove after cost calibration

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
