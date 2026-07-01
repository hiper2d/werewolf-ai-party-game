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
    GPT_5_5: 'gpt',
    GPT_5_4_MINI: 'gpt-mini',
    GEMINI_3_PRO: 'gemini-pro',
    GEMINI_3_FLASH: 'gemini-flash',
    GEMINI_3_FLASH_LITE: 'gemini-lite',
    MISTRAL_3_LARGE: 'mistral-large',
    MISTRAL_3_5_MEDIUM: 'mistral-medium',
    MISTRAL_4_SMALL: 'mistral-small',
    MISTRAL_MAGISTRAL: 'mistral-magistral',
    GROK_4_3: 'grok',
    GROK_4_3_THINKING: 'grok-thinking',
    KIMI: 'kimi',
    KIMI_THINKING: 'kimi-thinking',
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

export interface ModelConfig {
    displayName: string;
    modelApiName: string;
    apiKeyName: string;
    hasThinking: boolean;
    temperature?: number; // Override agent default temperature; omit to use the agent's built-in default
    maxOutputTokens?: number;
    tags?: ModelTag[];
    freeTier?: {
        available: boolean;
        maxBotsPerGame: number; // -1 means unlimited bots, 0 means not available, 1 means only 1 bot (GM or player) can use this model
    };
}

export const SupportedAiModels: Record<string, ModelConfig> = {
    // Claude models - separate with/without thinking versions
    [LLM_CONSTANTS.CLAUDE_4_OPUS]: {
        displayName: 'Claude 4.8 Opus',
        modelApiName: 'claude-opus-4-8',
        apiKeyName: API_KEY_CONSTANTS.ANTHROPIC,
        hasThinking: false,
        tags: ['slow', 'expensive'],
    },
    [LLM_CONSTANTS.CLAUDE_4_OPUS_THINKING]: {
        displayName: 'Claude 4.8 Opus (Thinking)',
        modelApiName: 'claude-opus-4-8',
        apiKeyName: API_KEY_CONSTANTS.ANTHROPIC,
        hasThinking: true,
        tags: ['slow', 'expensive'],
    },
    [LLM_CONSTANTS.CLAUDE_4_SONNET]: {
        displayName: 'Claude 5 Sonnet',
        modelApiName: 'claude-sonnet-5',
        apiKeyName: API_KEY_CONSTANTS.ANTHROPIC,
        hasThinking: false,
        tags: ['slow', 'expensive'],
    },
    [LLM_CONSTANTS.CLAUDE_4_SONNET_THINKING]: {
        displayName: 'Claude 5 Sonnet (Thinking)',
        modelApiName: 'claude-sonnet-5',
        apiKeyName: API_KEY_CONSTANTS.ANTHROPIC,
        hasThinking: true,
        tags: ['slow', 'expensive'],
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
    [LLM_CONSTANTS.GPT_5_5]: {
        displayName: 'GPT-5.5',
        modelApiName: 'gpt-5.5',
        apiKeyName: API_KEY_CONSTANTS.OPENAI,
        hasThinking: true,
        temperature: 1,
        tags: ['slow', 'expensive'],
    },
    [LLM_CONSTANTS.GPT_5_4_MINI]: {
        displayName: 'GPT-5.4-mini',
        modelApiName: 'gpt-5.4-mini',
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
        tags: ['slow', 'expensive'],
    },
    [LLM_CONSTANTS.GEMINI_3_FLASH]: {
        displayName: 'Gemini 3.5 Flash',
        modelApiName: 'gemini-3.5-flash',
        apiKeyName: API_KEY_CONSTANTS.GOOGLE,
        hasThinking: true,
        tags: ['fast'],
    },
    [LLM_CONSTANTS.GEMINI_3_FLASH_LITE]: {
        displayName: 'Gemini 3.1 Flash Lite',
        modelApiName: 'gemini-3.1-flash-lite',
        apiKeyName: API_KEY_CONSTANTS.GOOGLE,
        hasThinking: true,
        tags: ['fast', 'cheap'],
    },
    [LLM_CONSTANTS.GROK_4_3]: {
        displayName: 'Grok 4.3',
        modelApiName: 'grok-4.3',
        apiKeyName: API_KEY_CONSTANTS.GROK,
        hasThinking: false,
        temperature: 0.7,
        tags: ['fast'],
    },
    [LLM_CONSTANTS.GROK_4_3_THINKING]: {
        displayName: 'Grok 4.3 (Thinking)',
        modelApiName: 'grok-4.3',
        apiKeyName: API_KEY_CONSTANTS.GROK,
        hasThinking: true,
        temperature: 0.7,
        tags: ['slow', 'expensive'],
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

    // Kimi models
    [LLM_CONSTANTS.KIMI]: {
        displayName: 'Kimi K2.6',
        modelApiName: 'kimi-k2.6',
        apiKeyName: API_KEY_CONSTANTS.MOONSHOT,
        hasThinking: false,
        // Temperature is omitted from the request: Kimi K2.6 uses a fixed default per Moonshot docs.
    },
    [LLM_CONSTANTS.KIMI_THINKING]: {
        displayName: 'Kimi K2.6 (Thinking)',
        modelApiName: 'kimi-k2.6',
        apiKeyName: API_KEY_CONSTANTS.MOONSHOT,
        hasThinking: true,
        // Temperature is omitted from the request: Kimi K2.6 uses a fixed default per Moonshot docs.
        tags: ['very-slow'],
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

export function getModelConfigByApiName(modelApiName: string): ModelConfig | undefined {
    return Object.values(SupportedAiModels).find(config => config.modelApiName === modelApiName);
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
    // OpenAI models
    [SupportedAiModels[LLM_CONSTANTS.GPT_5_5].modelApiName]: {
        inputPrice: 5.000,
        outputPrice: 30.000,
        cacheHitPrice: 2.500
    },
    [SupportedAiModels[LLM_CONSTANTS.GPT_5_4_MINI].modelApiName]: {
        inputPrice: 0.750,
        outputPrice: 4.500,
        cacheHitPrice: 0.075
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
        inputPrice: 0.95,
        outputPrice: 4.00,
        cacheHitPrice: 0.16
    },

    // Z.AI models
    [SupportedAiModels[LLM_CONSTANTS.GLM].modelApiName]: {
        inputPrice: 1.4,
        outputPrice: 4.4,
        cacheHitPrice: 0.26
    },

    // Anthropic models
    [SupportedAiModels[LLM_CONSTANTS.CLAUDE_4_OPUS].modelApiName]: {
        inputPrice: 5.0,
        outputPrice: 25.0
    },
    [SupportedAiModels[LLM_CONSTANTS.CLAUDE_4_SONNET].modelApiName]: {
        inputPrice: 3.0,
        outputPrice: 15.0
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
        outputPrice: 9.00,
        cacheHitPrice: 0.15
    },
    [SupportedAiModels[LLM_CONSTANTS.GEMINI_3_FLASH_LITE].modelApiName]: {
        // Cache storage cost ($1.00 / 1M tokens per hour) is not tracked here — the
        // schema only models per-token call costs, not time-based storage.
        inputPrice: 0.025,
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

    // Grok models — both grok and grok-thinking share grok-4.3
    [SupportedAiModels[LLM_CONSTANTS.GROK_4_3].modelApiName]: {
        inputPrice: 1.25,
        outputPrice: 2.50,
        cacheHitPrice: 0.20
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
 *   <= $5  → up to 3 bots
 *   <= $15 → 1 bot
 *   > $15  → not available on the free tier
 *
 * Optional "(Thinking)" variants — a thinking model that shares its `modelApiName` with a cheaper
 * non-thinking sibling — burn extra reasoning tokens at the same per-token price, so their
 * effective output price is multiplied by THINKING_COST_FACTOR before banding. Always-on reasoning
 * models (GPT-5, Gemini 3, Magistral) have no non-thinking sibling and are priced as listed.
 */
export const FREE_TIER_OUTPUT_PRICE_BANDS = {
    UNLIMITED_MAX: 2,   // <= $2/1M output → unlimited bots
    LIMITED_MAX: 5,     // <= $5 → up to LIMITED_MAX_BOTS bots
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
for (const config of Object.values(SupportedAiModels)) {
    config.freeTier = getFreeTierPolicy(config.modelApiName, config.hasThinking);
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

    // Other providers don't support signatures, return empty
    return {};
}
