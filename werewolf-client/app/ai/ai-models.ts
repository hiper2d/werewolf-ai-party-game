/**
 * AI Model Configuration and Pricing
 * 
 * This file contains the current AI model definitions, API key mappings,
 * and pricing information for all supported AI providers.
 * 
 * All model definitions are actively used and up-to-date.
 * Pricing is updated as of March 2026.
 */

export const API_KEY_CONSTANTS = {
    OPENAI: 'OPENAI_API_KEY',
    ANTHROPIC: 'ANTHROPIC_API_KEY',
    GOOGLE: 'GOOGLE_API_KEY',
    MISTRAL: 'MISTRAL_API_KEY',
    DEEPSEEK: 'DEEPSEEK_API_KEY',
    GROK: 'GROK_API_KEY',
    MOONSHOT: 'MOONSHOT_API_KEY',
    Z_AI: 'Z_AI_API_KEY',
    FUGU: 'FUGU_API_KEY'
} as const;

export const SupportedAiKeyNames: Record<string, string> = {
    [API_KEY_CONSTANTS.OPENAI]: 'OpenAI',
    [API_KEY_CONSTANTS.ANTHROPIC]: 'Anthropic',
    [API_KEY_CONSTANTS.GOOGLE]: 'Google',
    [API_KEY_CONSTANTS.MISTRAL]: 'Mistral',
    [API_KEY_CONSTANTS.DEEPSEEK]: 'DeepSeek',
    [API_KEY_CONSTANTS.GROK]: 'Grok',
    [API_KEY_CONSTANTS.MOONSHOT]: 'Moonshot',
    [API_KEY_CONSTANTS.Z_AI]: 'Z.AI',
    [API_KEY_CONSTANTS.FUGU]: 'Sakana Fugu'
};

export const LLM_CONSTANTS = {
    // Fable 5 always reasons — its thinking cannot be disabled — so there's no non-thinking variant.
    CLAUDE_FABLE: 'claude-fable',
    CLAUDE_4_OPUS: 'claude-opus',
    CLAUDE_4_OPUS_THINKING: 'claude-opus-thinking',
    CLAUDE_4_SONNET: 'claude-sonnet',
    CLAUDE_4_SONNET_THINKING: 'claude-sonnet-thinking',
    CLAUDE_4_HAIKU: 'claude-haiku',
    CLAUDE_4_HAIKU_THINKING: 'claude-haiku-thinking',
    DEEPSEEK_V4_FLASH: 'deepseek-flash',
    DEEPSEEK_V4_FLASH_THINKING: 'deepseek-flash-thinking',
    DEEPSEEK_V4_PRO: 'deepseek-pro',
    DEEPSEEK_V4_PRO_THINKING: 'deepseek-pro-thinking',
    // GPT-5.6 family. 'gpt' and 'gpt-mini' are stable picker ids carried over from the
    // GPT-5.5 / GPT-5.4-mini era so existing games keep working across the repoint.
    GPT_5_6_SOL: 'gpt-sol',
    GPT_5_6_TERRA: 'gpt',
    GPT_5_6_LUNA: 'gpt-mini',
    GEMINI_3_PRO: 'gemini-pro',
    GEMINI_3_FLASH: 'gemini-flash',
    GEMINI_3_FLASH_LITE: 'gemini-lite',
    MISTRAL_3_LARGE: 'mistral-large',
    MISTRAL_3_5_MEDIUM: 'mistral-medium',
    MISTRAL_4_SMALL: 'mistral-small',
    MISTRAL_MAGISTRAL: 'mistral-magistral',
    GROK_4_5: 'grok',
    KIMI: 'kimi',
    GLM: 'glm',
    GLM_THINKING: 'glm-thinking',
    FUGU: 'fugu',
    FUGU_ULTRA: 'fugu-ultra',
    RANDOM: 'random',
}

export const AUDIO_MODEL_CONSTANTS = {
    TTS: 'gpt-4o-mini-tts',
    STT: 'whisper-1',
} as const;

export interface AudioModelPricing {
    pricePerMillionCharacters?: number;
    pricePerMinute?: number;
}

export const AUDIO_MODEL_PRICING: Record<string, AudioModelPricing> = {
    [AUDIO_MODEL_CONSTANTS.TTS]: {
        // OpenAI pricing as of Feb 2025: $15 per 1M characters for gpt-4o-mini-tts
        pricePerMillionCharacters: 15,
    },
    [AUDIO_MODEL_CONSTANTS.STT]: {
        // Whisper (whisper-1) pricing: $0.006 per minute of audio
        pricePerMinute: 0.006,
    },
};

export type ModelTag = 'fast' | 'slow' | 'very-slow' | 'cheap' | 'expensive';

export type ReasoningEffort = 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface ModelConfig {
    displayName: string;
    modelApiName: string;
    apiKeyName: string;
    hasThinking: boolean;
    temperature?: number; // Override agent default temperature; omit to use the agent's built-in default
    // Reasoning-depth knobs. Providers speak two dialects, so there are two fields; a model uses
    // at most one of them, and omitting it means "provider default" (e.g. GPT-5 runs at OpenAI's
    // default medium effort, Fugu/Grok at their fixed "high").
    // ReasoningEffort is the superset of provider vocabularies — each provider accepts only its
    // own slice, and the agent passes the value through verbatim, so pick one the model's API
    // supports: Anthropic adaptive thinking takes low|medium|high|xhigh|max, OpenAI takes
    // minimal|low|medium|high|xhigh, Fugu takes high|xhigh.
    reasoningEffort?: ReasoningEffort; // Effort-based APIs (Anthropic adaptive thinking)
    thinkingBudgetTokens?: number; // Budget-based APIs (Anthropic enabled thinking, Gemini)
    maxOutputTokens?: number;
    tags?: ModelTag[];
    freeTier?: {
        available: boolean;
        maxBotsPerGame: number; // -1 means unlimited bots, 0 means not available, 1 means only 1 bot (GM or player) can use this model
    };
}

export const SupportedAiModels: Record<string, ModelConfig> = {
    // Claude Fable - frontier reasoning model. Thinking is always on (no non-thinking variant),
    // paid/API tier only (very expensive).
    [LLM_CONSTANTS.CLAUDE_FABLE]: {
        displayName: 'Claude Fable 5',
        modelApiName: 'claude-fable-5',
        apiKeyName: API_KEY_CONSTANTS.ANTHROPIC,
        hasThinking: true,
        reasoningEffort: 'high',
        tags: ['slow', 'expensive'],
    },

    // Claude models - separate with/without thinking versions
    [LLM_CONSTANTS.CLAUDE_4_OPUS]: {
        displayName: 'Claude 5 Opus',
        modelApiName: 'claude-opus-5',
        apiKeyName: API_KEY_CONSTANTS.ANTHROPIC,
        hasThinking: false,
        tags: ['expensive'],
    },
    [LLM_CONSTANTS.CLAUDE_4_OPUS_THINKING]: {
        displayName: 'Claude 5 Opus (Thinking)',
        modelApiName: 'claude-opus-5',
        apiKeyName: API_KEY_CONSTANTS.ANTHROPIC,
        hasThinking: true,
        reasoningEffort: 'high',
        tags: ['expensive'],
    },
    [LLM_CONSTANTS.CLAUDE_4_SONNET]: {
        displayName: 'Claude 5 Sonnet',
        modelApiName: 'claude-sonnet-5',
        apiKeyName: API_KEY_CONSTANTS.ANTHROPIC,
        hasThinking: false,
        tags: ['expensive'],
    },
    [LLM_CONSTANTS.CLAUDE_4_SONNET_THINKING]: {
        displayName: 'Claude 5 Sonnet (Thinking)',
        modelApiName: 'claude-sonnet-5',
        apiKeyName: API_KEY_CONSTANTS.ANTHROPIC,
        hasThinking: true,
        reasoningEffort: 'high',
        tags: ['expensive'],
    },
    [LLM_CONSTANTS.CLAUDE_4_HAIKU]: {
        displayName: 'Claude 4.5 Haiku',
        modelApiName: 'claude-haiku-4-5',
        apiKeyName: API_KEY_CONSTANTS.ANTHROPIC,
        hasThinking: false,
        tags: ['fast', 'cheap'],
    },
    [LLM_CONSTANTS.CLAUDE_4_HAIKU_THINKING]: {
        displayName: 'Claude 4.5 Haiku (Thinking)',
        modelApiName: 'claude-haiku-4-5',
        apiKeyName: API_KEY_CONSTANTS.ANTHROPIC,
        hasThinking: true,
        thinkingBudgetTokens: 1024,
        tags: ['fast', 'cheap'],
    },

    // DeepSeek V4 models - Flash and Pro, each with thinking toggle
    [LLM_CONSTANTS.DEEPSEEK_V4_FLASH]: {
        displayName: 'DeepSeek V4 Flash',
        modelApiName: 'deepseek-v4-flash',
        apiKeyName: API_KEY_CONSTANTS.DEEPSEEK,
        hasThinking: false,
        temperature: 0.6,
        maxOutputTokens: 16384,
        tags: ['fast', 'cheap'],
    },
    [LLM_CONSTANTS.DEEPSEEK_V4_FLASH_THINKING]: {
        displayName: 'DeepSeek V4 Flash (Thinking)',
        modelApiName: 'deepseek-v4-flash',
        apiKeyName: API_KEY_CONSTANTS.DEEPSEEK,
        hasThinking: true,
        // Reasoning tokens share the output budget, so leave room for both CoT and answer.
        maxOutputTokens: 65536,
        tags: ['fast', 'cheap'],
    },
    [LLM_CONSTANTS.DEEPSEEK_V4_PRO]: {
        displayName: 'DeepSeek V4 Pro',
        modelApiName: 'deepseek-v4-pro',
        apiKeyName: API_KEY_CONSTANTS.DEEPSEEK,
        hasThinking: false,
        temperature: 0.6,
        maxOutputTokens: 16384,
        tags: ['slow', 'cheap'],
    },
    [LLM_CONSTANTS.DEEPSEEK_V4_PRO_THINKING]: {
        displayName: 'DeepSeek V4 Pro (Thinking)',
        modelApiName: 'deepseek-v4-pro',
        apiKeyName: API_KEY_CONSTANTS.DEEPSEEK,
        hasThinking: true,
        // Reasoning tokens share the output budget, so leave room for both CoT and answer.
        maxOutputTokens: 65536,
        tags: ['slow', 'cheap'],
    },

    // Models with always-on reasoning
    // GPT-5.6 family (promoted July 2026 when the limited preview opened up):
    // sol is the paid-only flagship, terra the mainline, luna the cheap tier.
    [LLM_CONSTANTS.GPT_5_6_SOL]: {
        displayName: 'GPT-5.6 Sol',
        modelApiName: 'gpt-5.6-sol',
        apiKeyName: API_KEY_CONSTANTS.OPENAI,
        hasThinking: true,
        temperature: 1,
        tags: ['expensive'],
    },
    [LLM_CONSTANTS.GPT_5_6_TERRA]: {
        displayName: 'GPT-5.6 Terra',
        modelApiName: 'gpt-5.6-terra',
        apiKeyName: API_KEY_CONSTANTS.OPENAI,
        hasThinking: true,
        temperature: 1,
        tags: ['expensive'],
    },
    [LLM_CONSTANTS.GPT_5_6_LUNA]: {
        displayName: 'GPT-5.6 Luna',
        modelApiName: 'gpt-5.6-luna',
        apiKeyName: API_KEY_CONSTANTS.OPENAI,
        hasThinking: true,
        temperature: 1,
        tags: ['fast', 'cheap'],
    },
    [LLM_CONSTANTS.GEMINI_3_PRO]: {
        displayName: 'Gemini 3.1 Pro Preview',
        modelApiName: 'gemini-3.1-pro-preview',
        apiKeyName: API_KEY_CONSTANTS.GOOGLE,
        hasThinking: true,
        thinkingBudgetTokens: 1024,
        tags: ['slow', 'expensive'],
    },
    [LLM_CONSTANTS.GEMINI_3_FLASH]: {
        displayName: 'Gemini 3.6 Flash',
        modelApiName: 'gemini-3.6-flash',
        apiKeyName: API_KEY_CONSTANTS.GOOGLE,
        hasThinking: true,
        thinkingBudgetTokens: 1024,
        tags: ['fast'],
    },
    [LLM_CONSTANTS.GEMINI_3_FLASH_LITE]: {
        displayName: 'Gemini 3.5 Flash Lite',
        modelApiName: 'gemini-3.5-flash-lite',
        apiKeyName: API_KEY_CONSTANTS.GOOGLE,
        hasThinking: true,
        thinkingBudgetTokens: 1024,
        tags: ['fast', 'cheap'],
    },
    // Always-on reasoning (xAI default effort "high", cannot be disabled) — no non-thinking sibling
    [LLM_CONSTANTS.GROK_4_5]: {
        displayName: 'Grok 4.5',
        modelApiName: 'grok-4.5',
        apiKeyName: API_KEY_CONSTANTS.GROK,
        hasThinking: true,
        temperature: 0.7,
        tags: ['slow'],
    },

    // Mistral models
    [LLM_CONSTANTS.MISTRAL_3_LARGE]: {
        displayName: 'Mistral Large 3',
        modelApiName: 'mistral-large-latest',
        apiKeyName: API_KEY_CONSTANTS.MISTRAL,
        hasThinking: false,
    },
    [LLM_CONSTANTS.MISTRAL_3_5_MEDIUM]: {
        displayName: 'Mistral Medium 3.5',
        modelApiName: 'mistral-medium-3',
        apiKeyName: API_KEY_CONSTANTS.MISTRAL,
        hasThinking: false,
        tags: ['fast', 'expensive'],
    },
    [LLM_CONSTANTS.MISTRAL_4_SMALL]: {
        displayName: 'Mistral 4 Small',
        modelApiName: 'mistral-small-latest',
        apiKeyName: API_KEY_CONSTANTS.MISTRAL,
        hasThinking: false,
        tags: ['fast', 'cheap'],
    },
    [LLM_CONSTANTS.MISTRAL_MAGISTRAL]: {
        displayName: 'Magistral Medium 1.2 (Thinking)',
        modelApiName: 'magistral-medium-latest',
        apiKeyName: API_KEY_CONSTANTS.MISTRAL,
        hasThinking: true,
    },

    // Kimi models. Single always-reasoning entry: K3 reasons by default and the only way to stop
    // it is the undocumented K2-era `thinking: disabled` toggle, which we no longer rely on.
    [LLM_CONSTANTS.KIMI]: {
        displayName: 'Kimi K3',
        modelApiName: 'kimi-k3',
        apiKeyName: API_KEY_CONSTANTS.MOONSHOT,
        hasThinking: true,
        // Temperature is omitted from the request: kimi-k3 rejects any value other than 1.
        tags: ['expensive'],
        // Explicit policy, opting out of price banding. Banding on the $15 sticker output price
        // would land K3 exactly on the SINGLE_MAX boundary (1 bot), but that price understates
        // what a turn really costs: K3 always reasons at max effort, and ~85-90% of its output
        // tokens are reasoning tokens billed at the output rate. It dodges the usual
        // FREE_TIER_THINKING_COST_FACTOR only because it has no non-thinking sibling entry;
        // with that factor it would be $37.50 effective, far past the free-tier ceiling.
        freeTier: { available: false, maxBotsPerGame: 0 },
    },

    // Z.AI models
    [LLM_CONSTANTS.GLM]: {
        displayName: 'GLM-5.2',
        modelApiName: 'glm-5.2',
        apiKeyName: API_KEY_CONSTANTS.Z_AI,
        hasThinking: false,
        temperature: 0.7,
    },
    [LLM_CONSTANTS.GLM_THINKING]: {
        displayName: 'GLM-5.2 (Thinking)',
        modelApiName: 'glm-5.2',
        apiKeyName: API_KEY_CONSTANTS.Z_AI,
        hasThinking: true,
        temperature: 0.7,
        tags: ['slow'],
    },

    // Sakana Fugu models — OpenAI-compatible. They reason internally (and bill it as
    // "orchestration" tokens), but never surface reasoning to us: responses come back with
    // reasoning_tokens: 0 and no reasoning_content. So hasThinking is false — there's no
    // thinking content to show and no user-facing thinking toggle. Single picker entry per model.
    [LLM_CONSTANTS.FUGU]: {
        displayName: 'Sakana Fugu',
        modelApiName: 'fugu',
        apiKeyName: API_KEY_CONSTANTS.FUGU,
        hasThinking: false,
        tags: ['slow'],
    },
    [LLM_CONSTANTS.FUGU_ULTRA]: {
        displayName: 'Sakana Fugu Ultra',
        modelApiName: 'fugu-ultra',
        apiKeyName: API_KEY_CONSTANTS.FUGU,
        hasThinking: false,
        tags: ['slow', 'expensive'],
    },
};

export type LLMModel = keyof typeof SupportedAiModels;

export function getModelTags(modelId: string): ModelTag[] {
    return SupportedAiModels[modelId]?.tags ?? [];
}

export function modelHasTag(modelId: string, tag: ModelTag): boolean {
    return getModelTags(modelId).includes(tag);
}

export function getModelDisplayName(modelId: string): string {
    return SupportedAiModels[modelId]?.displayName ?? modelId;
}

/**
 * Looks up a model's config by API name. Thinking and non-thinking picker variants share a
 * modelApiName but can differ in config (reasoning knobs, maxOutputTokens), so pass hasThinking
 * to select the right variant; without it (or if no variant matches) the first entry wins.
 */
export function getModelConfigByApiName(modelApiName: string, hasThinking?: boolean): ModelConfig | undefined {
    const candidates = Object.values(SupportedAiModels).filter(config => config.modelApiName === modelApiName);
    if (hasThinking !== undefined) {
        const exact = candidates.find(config => config.hasThinking === hasThinking);
        if (exact) {
            return exact;
        }
    }
    return candidates[0];
}

/**
 * Model pricing configuration
 * All prices are in USD per 1,000,000 tokens
 */
export interface ModelPricing {
    inputPrice: number;      // Price per million input tokens
    outputPrice: number;     // Price per million output tokens
    cacheHitPrice?: number;  // Optional: Price per million cached tokens (if applicable)
    extendedContextInputPrice?: number; // Optional: Price per million input tokens when context exceeds threshold
    extendedContextOutputPrice?: number; // Optional: Price per million output tokens when context exceeds threshold
    extendedContextCacheHitPrice?: number; // Optional: Price per million cached tokens for extended contexts
    extendedContextThresholdTokens?: number; // Optional: Threshold at which extended pricing applies
}

/**
 * Centralized pricing configuration for all AI models
 * All prices are per million (1,000,000) tokens
 * Updated as of April 2026
 */
export const MODEL_PRICING: Record<string, ModelPricing> = {
    // OpenAI GPT-5.6 models
    [SupportedAiModels[LLM_CONSTANTS.GPT_5_6_SOL].modelApiName]: {
        inputPrice: 5.000,
        outputPrice: 30.000,
        cacheHitPrice: 0.500
    },
    [SupportedAiModels[LLM_CONSTANTS.GPT_5_6_TERRA].modelApiName]: {
        inputPrice: 2.500,
        outputPrice: 15.000,
        cacheHitPrice: 0.250
    },
    [SupportedAiModels[LLM_CONSTANTS.GPT_5_6_LUNA].modelApiName]: {
        inputPrice: 1.000,
        outputPrice: 6.000,
        cacheHitPrice: 0.100
    },

    // DeepSeek V4 models
    [SupportedAiModels[LLM_CONSTANTS.DEEPSEEK_V4_FLASH].modelApiName]: {
        inputPrice: 0.14,
        outputPrice: 0.28,
        cacheHitPrice: 0.0028
    },
    [SupportedAiModels[LLM_CONSTANTS.DEEPSEEK_V4_PRO].modelApiName]: {
        inputPrice: 0.435,
        outputPrice: 0.87,
        cacheHitPrice: 0.003625
    },

    // Kimi/Moonshot models
    [SupportedAiModels[LLM_CONSTANTS.KIMI].modelApiName]: {
        inputPrice: 3.00,
        outputPrice: 15.00,
        cacheHitPrice: 0.30
    },

    // Z.AI models
    [SupportedAiModels[LLM_CONSTANTS.GLM].modelApiName]: {
        inputPrice: 1.4,
        outputPrice: 4.4,
        cacheHitPrice: 0.26
    },

    // Anthropic models
    [SupportedAiModels[LLM_CONSTANTS.CLAUDE_FABLE].modelApiName]: {
        // Full 1M context window at standard pricing (no extended-context premium)
        inputPrice: 10.0,
        outputPrice: 50.0,
        cacheHitPrice: 1.0
    },
    [SupportedAiModels[LLM_CONSTANTS.CLAUDE_4_OPUS].modelApiName]: {
        inputPrice: 5.0,
        outputPrice: 25.0,
        cacheHitPrice: 0.50
    },
    [SupportedAiModels[LLM_CONSTANTS.CLAUDE_4_SONNET].modelApiName]: {
        inputPrice: 3.0,
        outputPrice: 15.0,
        cacheHitPrice: 0.20
    },
    [SupportedAiModels[LLM_CONSTANTS.CLAUDE_4_HAIKU].modelApiName]: {
        inputPrice: 1.0,
        outputPrice: 5.0,
        cacheHitPrice: 0.10
    },

    // Google models
    [SupportedAiModels[LLM_CONSTANTS.GEMINI_3_PRO].modelApiName]: {
        inputPrice: 2.0,
        outputPrice: 12.0,
        cacheHitPrice: 0.20,
        extendedContextInputPrice: 4.0,
        extendedContextOutputPrice: 18.0,
        extendedContextCacheHitPrice: 0.40,
        extendedContextThresholdTokens: 200_000
    },
    [SupportedAiModels[LLM_CONSTANTS.GEMINI_3_FLASH].modelApiName]: {
        // Cache storage cost ($1.00 / 1M tokens per hour) is not tracked here — the
        // schema only models per-token call costs, not time-based storage.
        inputPrice: 1.50,
        outputPrice: 7.50,
        cacheHitPrice: 0.15
    },
    [SupportedAiModels[LLM_CONSTANTS.GEMINI_3_FLASH_LITE].modelApiName]: {
        // Cache storage cost ($1.00 / 1M tokens per hour) is not tracked here — the
        // schema only models per-token call costs, not time-based storage.
        inputPrice: 0.30,
        outputPrice: 1.50,
        cacheHitPrice: 0.025
    },

    // Mistral models
    [SupportedAiModels[LLM_CONSTANTS.MISTRAL_3_LARGE].modelApiName]: {
        inputPrice: 0.5,
        outputPrice: 1.5
    },
    [SupportedAiModels[LLM_CONSTANTS.MISTRAL_3_5_MEDIUM].modelApiName]: {
        inputPrice: 1.5,
        outputPrice: 7.5
    },
    [SupportedAiModels[LLM_CONSTANTS.MISTRAL_4_SMALL].modelApiName]: {
        inputPrice: 0.15,
        outputPrice: 0.6
    },
    [SupportedAiModels[LLM_CONSTANTS.MISTRAL_MAGISTRAL].modelApiName]: {
        inputPrice: 2.0,
        outputPrice: 5.0
    },

    // Grok models
    [SupportedAiModels[LLM_CONSTANTS.GROK_4_5].modelApiName]: {
        inputPrice: 2.0,
        outputPrice: 6.0,
        cacheHitPrice: 0.50
    },

    // Sakana Fugu models
    // base `fugu` is a dynamic router — Sakana publishes no fixed per-token price ("you pay the
    // underlying model's rate"). We've set a working rate of $1 in / $3 out: the $3 output lands
    // it in the "<= $5 output → 3 bots" free-tier band (see FREE_TIER_OUTPUT_PRICE_BANDS), which
    // is the intended cap. NOTE this rate is input-blind on purpose for now — `fugu` is actually
    // input-heavy and barely cacheable (~2% cache hits, it's a router), so output-price banding
    // understates its real cost. Revisit with real Sakana dashboard numbers if it proves too cheap.
    [SupportedAiModels[LLM_CONSTANTS.FUGU].modelApiName]: {
        inputPrice: 1.0,
        outputPrice: 3.0
    },
    // fugu-ultra has published pricing. Above 272K context the rates roughly double.
    [SupportedAiModels[LLM_CONSTANTS.FUGU_ULTRA].modelApiName]: {
        inputPrice: 5.0,
        outputPrice: 30.0,
        cacheHitPrice: 0.50,
        extendedContextInputPrice: 10.0,
        extendedContextOutputPrice: 45.0,
        extendedContextCacheHitPrice: 1.00,
        extendedContextThresholdTokens: 272_000
    }
};

/**
 * Free-tier availability and the per-game bot cap are DERIVED FROM PRICE — not hand-tuned per
 * model — so the two stay consistent. The metric is a model's output price ($/1M tokens), which
 * dominates generation cost. Bands:
 *   <= $2  → unlimited bots
 *   <= $6  → up to 3 bots
 *   <= $15 → 1 bot
 *   > $15  → not available on the free tier
 *
 * Optional "(Thinking)" variants — a thinking model that shares its `modelApiName` with a cheaper
 * non-thinking sibling — burn extra reasoning tokens at the same per-token price, so their
 * effective output price is multiplied by THINKING_COST_FACTOR before banding. Always-on reasoning
 * models (GPT-5, Gemini 3, Magistral) have no non-thinking sibling and are priced as listed.
 */
/**
 * Model IDs that games may still hold in Firestore but that no longer exist in LLM_CONSTANTS,
 * mapped to their current equivalent. Games persist a model ID per bot and per GM, so a retired
 * ID lives on in old docs until `scripts/migrate-model-ids.ts` rewrites them — and even after,
 * for any doc written before the migration ran.
 *
 * Every path that resolves a persisted model ID must go through `resolveModelId`, not just agent
 * creation: tier validation re-checks *every* bot in a game, so one stale ID would otherwise make
 * the model picker unusable for that whole game.
 */
const DEPRECATED_MODEL_MAP: Record<string, string> = {
    'gpt-5.4': LLM_CONSTANTS.GPT_5_6_TERRA,
    'deepseek-chat': LLM_CONSTANTS.DEEPSEEK_V4_FLASH,
    'deepseek-reasoner': LLM_CONSTANTS.DEEPSEEK_V4_FLASH_THINKING,
    'grok-fast': LLM_CONSTANTS.GROK_4_5,
    'grok-thinking': LLM_CONSTANTS.GROK_4_5,
    // Kimi collapsed to a single always-reasoning K3 entry.
    'kimi-thinking': LLM_CONSTANTS.KIMI,
};

/** Maps a possibly-retired model ID to its current equivalent; unknown IDs pass through. */
export function resolveModelId(modelId: string): string {
    return DEPRECATED_MODEL_MAP[modelId] ?? modelId;
}

export const FREE_TIER_OUTPUT_PRICE_BANDS = {
    UNLIMITED_MAX: 2,   // <= $2/1M output → unlimited bots
    // Bumped 5 → 6 with the GPT-5.6 promotion so Luna ($6 output) keeps the 3-bot cap
    // its predecessor gpt-5.4-mini had. Grok 4.5 ($6 output) rides along 1 → 3 bots.
    LIMITED_MAX: 6,     // <= $6 → up to LIMITED_MAX_BOTS bots
    SINGLE_MAX: 15,     // <= $15 → 1 bot; above → not available on free tier
} as const;
export const FREE_TIER_LIMITED_MAX_BOTS = 3;
// A reasoning model bills its (hidden) thinking tokens at the output rate on top of the visible
// answer, so a turn costs more than the sticker output price implies. This multiplier approximates
// that overhead — a model's "effective" output cost ≈ outputPrice × factor on average. It's the
// extra cost of running a model in reasoning mode, and it's what free-tier budgeting is based on.
export const FREE_TIER_THINKING_COST_FACTOR = 2.5;

/** modelApiNames that have at least one non-thinking config — i.e. a thinking entry on one of
 *  these is an optional "(Thinking)" variant that should pay the reasoning-cost multiplier. */
const NON_THINKING_API_NAMES = new Set(
    Object.values(SupportedAiModels)
        .filter(c => !c.hasThinking)
        .map(c => c.modelApiName)
);

/**
 * Derives a model's free-tier policy ({ available, maxBotsPerGame }) from its price.
 * Returns "not available" (available: false, maxBotsPerGame: 0) when there's no pricing.
 */
export function getFreeTierPolicy(
    modelApiName: string,
    hasThinking: boolean
): { available: boolean; maxBotsPerGame: number } {
    const pricing = MODEL_PRICING[modelApiName];
    if (!pricing) {
        return { available: false, maxBotsPerGame: 0 };
    }
    const isOptionalThinkingVariant = hasThinking && NON_THINKING_API_NAMES.has(modelApiName);
    const effectiveOutputPrice = isOptionalThinkingVariant
        ? pricing.outputPrice * FREE_TIER_THINKING_COST_FACTOR
        : pricing.outputPrice;

    if (effectiveOutputPrice <= FREE_TIER_OUTPUT_PRICE_BANDS.UNLIMITED_MAX) {
        return { available: true, maxBotsPerGame: -1 };
    }
    if (effectiveOutputPrice <= FREE_TIER_OUTPUT_PRICE_BANDS.LIMITED_MAX) {
        return { available: true, maxBotsPerGame: FREE_TIER_LIMITED_MAX_BOTS };
    }
    if (effectiveOutputPrice <= FREE_TIER_OUTPUT_PRICE_BANDS.SINGLE_MAX) {
        return { available: true, maxBotsPerGame: 1 };
    }
    return { available: false, maxBotsPerGame: 0 };
}

// Populate each model's freeTier field from price — the single source of truth for free-tier caps.
// A model that hard-codes `freeTier` on its own entry opts out of price banding and keeps that
// explicit policy (used when the sticker output price misrepresents real cost — see Kimi K3).
for (const config of Object.values(SupportedAiModels)) {
    config.freeTier = config.freeTier ?? getFreeTierPolicy(config.modelApiName, config.hasThinking);
}

export interface CostCalculationOptions {
    cacheHitTokens?: number;
    contextTokens?: number;
    totalTokens?: number;
}

/**
 * Helper function to calculate cost based on model pricing
 * @param modelApiName - The API name of the model
 * @param inputTokens - Number of input tokens
 * @param outputTokens - Number of output tokens
 * @param options - Additional calculation details (cache hits, context tokens, etc.)
 * @returns Cost in USD
 */
export function calculateModelCost(
    modelApiName: string,
    inputTokens: number,
    outputTokens: number,
    options: CostCalculationOptions = {}
): number {
    const pricing = MODEL_PRICING[modelApiName];

    if (!pricing) {
        console.warn(`No pricing information available for model: ${modelApiName}`);
        return 0;
    }

    // All prices are per million tokens
    const divisor = 1_000_000;

    // Calculate cached vs uncached input tokens
    const cacheHitTokens = Math.max(0, options.cacheHitTokens ?? 0);
    const actualCacheHits = Math.min(cacheHitTokens, inputTokens);
    const uncachedInputTokens = Math.max(0, inputTokens - actualCacheHits);

    // Determine if extended context pricing applies
    const contextTokens = options.contextTokens ?? options.totalTokens ?? inputTokens;
    let activeInputPrice = pricing.inputPrice;
    let activeOutputPrice = pricing.outputPrice;
    let activeCachePrice = pricing.cacheHitPrice ?? pricing.inputPrice;

    if (
        pricing.extendedContextThresholdTokens !== undefined &&
        contextTokens > pricing.extendedContextThresholdTokens
    ) {
        activeInputPrice = pricing.extendedContextInputPrice ?? pricing.inputPrice;
        activeOutputPrice = pricing.extendedContextOutputPrice ?? pricing.outputPrice;
        activeCachePrice = pricing.extendedContextCacheHitPrice ?? pricing.cacheHitPrice ?? activeInputPrice;
    } else if (pricing.cacheHitPrice !== undefined) {
        activeCachePrice = pricing.cacheHitPrice;
    }

    // Calculate costs
    const uncachedInputCost = (uncachedInputTokens * activeInputPrice) / divisor;
    const cachedInputCost = (actualCacheHits * activeCachePrice) / divisor;
    const outputCost = (outputTokens * activeOutputPrice) / divisor;

    return uncachedInputCost + cachedInputCost + outputCost;
}

/**
 * Returns all models available for free tier users
 */
export function getFreeTierModels(): Array<{ modelName: string; config: ModelConfig }> {
    return Object.entries(SupportedAiModels)
        .filter(([_, config]) => config.freeTier?.available)
        .map(([modelName, config]) => ({ modelName, config }));
}

/**
 * Checks if a model is available for free tier users
 */
export function isModelAvailableForFreeTier(modelName: string): boolean {
    return SupportedAiModels[modelName]?.freeTier?.available || false;
}

/**
 * Gets the bot limit for a specific model in free tier
 * Returns null if model is not available in free tier
 * @returns -1 for unlimited, 0 for not available, 1 for only 1 bot per game, null if model not in free tier
 */
export function getFreeTierModelLimit(modelName: string): number | null {
    const model = SupportedAiModels[modelName];
    if (!model?.freeTier?.available) {
        return null;
    }
    return model.freeTier.maxBotsPerGame;
}

/**
 * Returns provider-specific signature fields based on the AI type.
 * Used when storing messages with thinking signatures from different providers.
 * @param aiType - The LLM type string (e.g., "Claude 4.5 Haiku (Thinking)", "Gemini 3 Flash Preview")
 * @param signature - The thinking signature from the API response (may be undefined)
 * @returns Object with appropriate signature fields for the message
 */
export function getProviderSignatureFields(aiType: string, signature?: string): {
    anthropicThinkingSignature?: string;
    googleThoughtSignature?: string;
    grokEncryptedReasoning?: string;
} {
    if (!signature) {
        return {};
    }

    // Check if it's an Anthropic (Claude) model
    if (aiType.startsWith('claude-')) {
        return { anthropicThinkingSignature: signature };
    }

    // Check if it's a Google (Gemini) model
    if (aiType.startsWith('gemini-')) {
        return { googleThoughtSignature: signature };
    }

    // Check if it's an xAI (Grok) model — JSON-serialized encrypted reasoning items
    if (aiType.startsWith('grok')) {
        return { grokEncryptedReasoning: signature };
    }

    // Other providers don't support signatures, return empty
    return {};
}
