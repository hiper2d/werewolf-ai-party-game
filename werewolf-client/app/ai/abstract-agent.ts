import { AIMessage, TokenUsage, AgentLoggingConfig, DEFAULT_LOGGING_CONFIG } from "@/app/api/game-models";
import { z } from 'zod';
import { logger } from "@/app/utils/logger";
import { CACHE_TIER_MARKER } from "@/app/ai/prompts/bot-prompts";
import { DEFAULT_MAX_OUTPUT_TOKENS, getModelConfigByApiName } from "@/app/ai/ai-models";

export abstract class AbstractAgent {
    name: string;
    gameId?: string;
    userId?: string;
    /**
     * Output ceiling sent with every request from this agent. Resolved once from the model's
     * catalog override, else DEFAULT_MAX_OUTPUT_TOKENS. Callers needing more room raise it
     * after construction (see story generation), the same way gameId/userId are assigned —
     * so subclasses must read it when building a request, never snapshot it at construction.
     */
    maxOutputTokens: number;
    protected readonly instruction: string;
    /**
     * The instruction split on CACHE_TIER_MARKER: [shared static tier, per-bot tier].
     * Length 1 when the prompt has no marker (GM prompts, tests). Providers with
     * explicit cache breakpoints (Anthropic) place one per part; everyone else uses
     * the joined marker-free `instruction`, whose shared prefix implicit caches match.
     */
    protected readonly instructionParts: string[];
    protected readonly temperature: number;
    protected readonly model: string;
    protected readonly enableThinking: boolean;
    protected readonly agentLoggingConfig: AgentLoggingConfig;

    protected constructor(
        name: string,
        instruction: string,
        model: string,
        temperature: number,
        enableThinking: boolean = false,
        agentLoggingConfig: AgentLoggingConfig = DEFAULT_LOGGING_CONFIG.agents
    ) {
        this.name = name;
        this.instructionParts = instruction
            .split(CACHE_TIER_MARKER)
            .filter(part => part.trim().length > 0);
        this.instruction = this.instructionParts.join('\n\n');
        this.temperature = temperature;
        this.model = model;
        this.enableThinking = enableThinking;
        this.agentLoggingConfig = agentLoggingConfig;
        this.maxOutputTokens = getModelConfigByApiName(model)?.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;
    }

    /**
     * Public ask API — template methods that time the provider call and stamp `durationMs`
     * into the returned TokenUsage. Subclasses implement doAskWithZodSchema/doAskText and
     * must NOT override these.
     */
    async askWithZodSchema<T>(zodSchema: z.ZodSchema<T>, messages: AIMessage[]): Promise<[T, string, TokenUsage?, string?]> {
        const startedAt = Date.now();
        try {
            const [result, thinking, usage, signature] = await this.doAskWithZodSchema(zodSchema, messages);
            return [result, thinking, this.stampDuration(usage, startedAt), signature];
        } catch (error) {
            this.stampErrorDuration(error, startedAt);
            throw error;
        }
    }

    async askText(messages: AIMessage[]): Promise<[string, string, TokenUsage?, string?]> {
        const startedAt = Date.now();
        try {
            const [content, thinking, usage, signature] = await this.doAskText(messages);
            return [content, thinking, this.stampDuration(usage, startedAt), signature];
        } catch (error) {
            this.stampErrorDuration(error, startedAt);
            throw error;
        }
    }

    private stampDuration(usage: TokenUsage | undefined, startedAt: number): TokenUsage | undefined {
        return usage ? { ...usage, durationMs: Date.now() - startedAt } : usage;
    }

    /** Failed calls carry their duration too — a 35s provider stall that errors is still signal. */
    private stampErrorDuration(error: unknown, startedAt: number): void {
        if (error && typeof error === 'object') {
            (error as { durationMs?: number }).durationMs = Date.now() - startedAt;
        }
    }

    protected abstract doAskWithZodSchema<T>(zodSchema: z.ZodSchema<T>, messages: AIMessage[]): Promise<[T, string, TokenUsage?, string?]>;

    /**
     * Plain-text ask: no schema appended to the prompt, no JSON mode, no parsing.
     * Returns [content, thinkingContent, tokenUsage?, thinkingSignature?] — same tuple
     * shape as doAskWithZodSchema but with the raw response string as content.
     * Implementations must throw on empty content so the recoverable-error/retry UX
     * is preserved (errors surface in the UI; the user triggers retries).
     */
    protected abstract doAskText(messages: AIMessage[]): Promise<[string, string, TokenUsage?, string?]>;

    protected logger(message: string): void {
        console.log(`[${this.name} ${this.model}]: ${message}`);
    }

    protected logAsking(messages: AIMessage[]): void {
        this.logger("==================================================");
        this.logger(`Asking ${this.name} ${this.model} agent`);
        this.logger("==================================================");
        
        logger.agentActivity(this.name, this.model, 'REQUEST', {
            gameId: this.gameId,
            userId: this.userId,
            systemPrompt: this.instruction,
            history: messages,
            command: messages.length > 0 ? messages[messages.length - 1].content : undefined
        }, this.agentLoggingConfig);
    }

    protected logSystemPrompt(): void {
        // No longer needed as it's included in logAsking's structured log
        // Keeping it for backward compatibility with subclasses that might call it
    }

    protected logMessages(messages: AIMessage[]): void {
        // Console logging still useful for local dev
        this.logger(`History for ${this.name}:`);
        messages.forEach((msg, index) => {
            const preview = msg.content.length > 1000 ? msg.content.substring(0, 1000) + '...' : msg.content;
            this.logger(`  ${index + 1}. [${msg.role}]: ${preview}`);
        });
    }

    protected logReply(reply: any, thinking?: string, usage?: TokenUsage): void {
        const replyStr = typeof reply === 'string' ? reply : JSON.stringify(reply);
        
        // Console logging
        this.logger(`Reply from ${this.name}:`);
        if (thinking) {
            const thinkingPreview = thinking.length > 500 ? thinking.substring(0, 500) + '...' : thinking;
            this.logger(`  [thinking]: ${thinkingPreview}`);
        }
        const preview = replyStr.length > 1000 ? replyStr.substring(0, 1000) + '...' : replyStr;
        this.logger(`  [assistant]: ${preview}`);

        logger.agentActivity(this.name, this.model, 'RESPONSE', {
            gameId: this.gameId,
            userId: this.userId,
            reply,
            thinking,
            usage
        }, this.agentLoggingConfig);
    }


    /**
     * Merges consecutive user messages (e.g. a GM command followed by the detached
     * reminder postfix) into one, for providers that expect alternating roles — this
     * reproduces the pre-detachment request shape. ClaudeAgent overrides this to keep
     * them separate: Anthropic combines consecutive user turns into one turn but keeps
     * distinct content blocks, which lets its fast cache breakpoint sit on the persisted
     * command block while the throwaway reminder rides behind it.
     */
    protected prepareMessages(messages: AIMessage[]): AIMessage[] {
        const result: AIMessage[] = [];
        for (const msg of messages) {
            const prev = result[result.length - 1];
            if (prev && prev.role === 'user' && msg.role === 'user') {
                result[result.length - 1] = { ...prev, content: `${prev.content}\n\n${msg.content}` };
            } else {
                result.push(msg);
            }
        }
        return result;
    }
}
