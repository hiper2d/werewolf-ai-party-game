/**
 * Core types shared by every agent and consumer app.
 */

export const MESSAGE_ROLE = {
    SYSTEM: "system" as const,
    USER: "user" as const,
    ASSISTANT: "assistant" as const
} as const;

export interface AIMessage {
    role: 'system' | 'user' | 'assistant' | 'developer';
    content: string;
    thinking?: string;  // Optional thinking content for models that support extended thinking
    anthropicThinkingSignature?: string;  // Signature for Anthropic/Claude thinking (required for multi-turn)
    googleThoughtSignature?: string;  // Signature for Google/Gemini thinking (required for multi-turn)
    grokEncryptedReasoning?: string;  // JSON-serialized xAI encrypted reasoning items (replayed for multi-turn)
}

export interface TokenUsage {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    costUSD: number;
    // Reasoning/thinking tokens, for models that report them. Already counted inside
    // outputTokens (and therefore in costUSD) — this is the breakdown, not an extra charge.
    // Omitted entirely rather than set to 0/undefined: Firestore rejects undefined values,
    // and non-reasoning models have no breakdown to record.
    reasoningTokens?: number;
    // Cached input tokens, for providers that report cache hits. Like reasoningTokens this
    // is a breakdown of inputTokens (already reflected in costUSD), omitted when the
    // provider reported nothing.
    cachedInputTokens?: number;
    // Wall-clock duration of the API call, stamped by AbstractAgent's public ask wrappers.
    // Client-measured — providers don't return processing time — so it includes network,
    // which is what the player actually waits through. Omitted when not measured.
    durationMs?: number;
}

export interface ApiKeyMap {
    [id: string]: string
}

export interface AgentLoggingConfig {
    enabled: boolean;
    logSystemPrompt: boolean;
    history: {
        enabled: boolean;
        maxCharactersPerMessage: number;
    };
    logCommand: boolean;
    reply: {
        mode: 'raw' | 'body-only';
        maxReplyChars: number;
        maxThinkingChars: number;
        includeReasoning: boolean;
        includeUsage: boolean;
    };
}

export interface LoggingConfig {
    agents: AgentLoggingConfig;
}

export const DEFAULT_LOGGING_CONFIG: LoggingConfig = {
    agents: {
        enabled: true,
        logSystemPrompt: process.env.LOG_SYSTEM_PROMPT !== 'false',
        history: {
            enabled: process.env.LOG_HISTORY !== 'false',
            maxCharactersPerMessage: parseInt(process.env.LOG_MAX_HISTORY_CHARS || '1000', 10),
        },
        logCommand: true,
        reply: {
            mode: (process.env.LOG_REPLY_MODE === 'raw' ? 'raw' : 'body-only') as 'raw' | 'body-only',
            maxReplyChars: parseInt(process.env.LOG_MAX_REPLY_CHARS || '5000', 10),
            maxThinkingChars: parseInt(process.env.LOG_MAX_THINKING_CHARS || '2000', 10),
            includeReasoning: process.env.LOG_INCLUDE_REASONING !== 'false',
            includeUsage: process.env.LOG_INCLUDE_USAGE !== 'false',
        },
    },
};

export class BotResponseError extends Error {
    public details: string;
    public context: Record<string, any>;
    public recoverable: boolean;
    /**
     * Model-facing explanation of the rejection, set where the failure is detected and carried
     * through to the consumer's error surface. Used to enrich a user-triggered retry prompt.
     */
    public explanation?: string;

    constructor(
        message: string,
        details: string = '',
        context: Record<string, any> = {},
        recoverable: boolean = true,
        explanation?: string
    ) {
        super(message);
        this.name = 'BotResponseError';
        this.details = details;
        this.context = context;
        this.recoverable = recoverable;
        this.explanation = explanation;
    }
}
