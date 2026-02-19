/**
 * AI Model Configuration and Pricing
 * 
 * This file contains the current AI model definitions, API key mappings,
 * and pricing information for all supported AI providers.
 * 
 * All model definitions are actively used and up-to-date.
 * Pricing is updated as of January 2025.
 */

export const API_KEY_CONSTANTS = {
    OPENAI: 'OPENAI_API_KEY',
    ANTHROPIC: 'ANTHROPIC_API_KEY',
    GOOGLE: 'GOOGLE_API_KEY',
    MISTRAL: 'MISTRAL_API_KEY',
    DEEPSEEK: 'DEEPSEEK_API_KEY',
    GROK: 'GROK_API_KEY',
    MOONSHOT: 'MOONSHOT_API_KEY'
} as const;

export const SupportedAiKeyNames: Record<string, string> = {
    [API_KEY_CONSTANTS.OPENAI]: 'OpenAI',
    [API_KEY_CONSTANTS.ANTHROPIC]: 'Anthropic',
    [API_KEY_CONSTANTS.GOOGLE]: 'Google',
    [API_KEY_CONSTANTS.MISTRAL]: 'Mistral',
    [API_KEY_CONSTANTS.DEEPSEEK]: 'DeepSeek',
    [API_KEY_CONSTANTS.GROK]: 'Grok',
    [API_KEY_CONSTANTS.MOONSHOT]: 'Moonshot'
};

export const LLM_CONSTANTS = {
    CLAUDE_4_OPUS: 'Claude 4.6 Opus',
    CLAUDE_4_OPUS_THINKING: 'Claude 4.6 Opus (Thinking)',
    CLAUDE_4_SONNET: 'Claude 4.6 Sonnet',
    CLAUDE_4_SONNET_THINKING: 'Claude 4.6 Sonnet (Thinking)',
    CLAUDE_4_HAIKU: 'Claude 4.5 Haiku',
    CLAUDE_4_HAIKU_THINKING: 'Claude 4.5 Haiku (Thinking)',
    DEEPSEEK_CHAT: 'DeepSeek Chat',
    DEEPSEEK_REASONER: 'DeepSeek Reasoner',
    GPT_5: 'GPT-5.2',
    GPT_5_MINI: 'GPT-5-mini',
    GEMINI_3_PRO: 'Gemini 3.1 Pro Preview',
    GEMINI_3_FLASH: 'Gemini 3 Flash Preview',
    MISTRAL_3_LARGE: 'Mistral Large 3',
    MISTRAL_3_MEDIUM: 'Mistral Medium 3.1',
    MISTRAL_MAGISTRAL: 'Magistral Medium 1.2 (Thinking)',
    GROK_4: 'Grok 4',
    GROK_4_1_FAST_REASONING: 'Grok 4.1 Fast Reasoning',
    KIMI_K2: 'Kimi K2',
    KIMI_K2_THINKING: 'Kimi K2 (Thinking)',
    KIMI_K2_5: 'Kimi K2.5',
    KIMI_K2_5_THINKING: 'Kimi K2.5 (Thinking)',
    RANDOM: 'Random',
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

export interface ModelConfig {
    modelApiName: string;
    apiKeyName: string;
    hasThinking: boolean;
    maxOutputTokens?: number;
    freeTier?: {
        available: boolean;
        maxBotsPerGame: number; // -1 means unlimited bots, 0 means not available, 1 means only 1 bot (GM or player) can use this model
    };
}

export const SupportedAiModels: Record<string, ModelConfig> = {
    // Claude models - separate with/without thinking versions
    [LLM_CONSTANTS.CLAUDE_4_OPUS]: {
        modelApiName: 'claude-opus-4-6',
        apiKeyName: API_KEY_CONSTANTS.ANTHROPIC,
        hasThinking: false,
        freeTier: {
            available: false,
            maxBotsPerGame: 0 // Too expensive - not available
        }
    },
    [LLM_CONSTANTS.CLAUDE_4_OPUS_THINKING]: {
        modelApiName: 'claude-opus-4-6',
        apiKeyName: API_KEY_CONSTANTS.ANTHROPIC,
        hasThinking: true,
        freeTier: {
            available: false,
            maxBotsPerGame: 0 // Too expensive - not available
        }
    },
    [LLM_CONSTANTS.CLAUDE_4_SONNET]: {
        modelApiName: 'claude-sonnet-4-6',
        apiKeyName: API_KEY_CONSTANTS.ANTHROPIC,
        hasThinking: false,
        freeTier: {
            available: true,
            maxBotsPerGame: 1
        }
    },
    [LLM_CONSTANTS.CLAUDE_4_SONNET_THINKING]: {
        modelApiName: 'claude-sonnet-4-6',
        apiKeyName: API_KEY_CONSTANTS.ANTHROPIC,
        hasThinking: true,
        freeTier: {
            available: false,
            maxBotsPerGame: 0 // Thinking version is expensive - not available
        }
    },
    [LLM_CONSTANTS.CLAUDE_4_HAIKU]: {
        modelApiName: 'claude-haiku-4-5',
        apiKeyName: API_KEY_CONSTANTS.ANTHROPIC,
        hasThinking: false,
        freeTier: {
            available: true,
            maxBotsPerGame: 3
        }
    },
    [LLM_CONSTANTS.CLAUDE_4_HAIKU_THINKING]: {
        modelApiName: 'claude-haiku-4-5',
        apiKeyName: API_KEY_CONSTANTS.ANTHROPIC,
        hasThinking: true,
        freeTier: {
            available: true,
            maxBotsPerGame: 1
        }
    },

    // DeepSeek models - separate Chat and Reasoner
    [LLM_CONSTANTS.DEEPSEEK_CHAT]: {
        modelApiName: 'deepseek-chat',
        apiKeyName: API_KEY_CONSTANTS.DEEPSEEK,
        hasThinking: false,
        maxOutputTokens: 8192,
        freeTier: {
            available: true,
            maxBotsPerGame: -1 // Unlimited - very affordable
        }
    },
    [LLM_CONSTANTS.DEEPSEEK_REASONER]: {
        modelApiName: 'deepseek-reasoner',
        apiKeyName: API_KEY_CONSTANTS.DEEPSEEK,
        hasThinking: true,
        maxOutputTokens: 8192,
        freeTier: {
            available: true,
            maxBotsPerGame: -1
        }
    },

    // Models with always-on reasoning
    [LLM_CONSTANTS.GPT_5]: {
        modelApiName: 'gpt-5.2',
        apiKeyName: API_KEY_CONSTANTS.OPENAI,
        hasThinking: true,
        freeTier: {
            available: true,
            maxBotsPerGame: 1
        }
    },
    [LLM_CONSTANTS.GPT_5_MINI]: {
        modelApiName: 'gpt-5-mini',
        apiKeyName: API_KEY_CONSTANTS.OPENAI,
        hasThinking: true,
        freeTier: {
            available: true,
            maxBotsPerGame: 3
        }
    },
    [LLM_CONSTANTS.GEMINI_3_PRO]: {
        modelApiName: 'gemini-3.1-pro-preview',
        apiKeyName: API_KEY_CONSTANTS.GOOGLE,
        hasThinking: true,
        freeTier: {
            available: false,
            maxBotsPerGame: 0 // Not available in free tier
        }
    },
    [LLM_CONSTANTS.GEMINI_3_FLASH]: {
        modelApiName: 'gemini-3-flash-preview',
        apiKeyName: API_KEY_CONSTANTS.GOOGLE,
        hasThinking: true,
        freeTier: {
            available: true,
            maxBotsPerGame: -1 // Unlimited
        }
    },
    [LLM_CONSTANTS.GROK_4]: {
        modelApiName: 'grok-4',
        apiKeyName: API_KEY_CONSTANTS.GROK,
        hasThinking: true,
        freeTier: {
            available: true,
            maxBotsPerGame: 1
        }
    },
    [LLM_CONSTANTS.GROK_4_1_FAST_REASONING]: {
        modelApiName: 'grok-4-1-fast-reasoning',
        apiKeyName: API_KEY_CONSTANTS.GROK,
        hasThinking: true,
        freeTier: {
            available: true,
            maxBotsPerGame: -1 // Very affordable
        }
    },

    // Mistral models
    [LLM_CONSTANTS.MISTRAL_3_LARGE]: {
        modelApiName: 'mistral-large-latest',
        apiKeyName: API_KEY_CONSTANTS.MISTRAL,
        hasThinking: false,
        freeTier: {
            available: true,
            maxBotsPerGame: -1 // Unlimited - very affordable
        }
    },
    [LLM_CONSTANTS.MISTRAL_3_MEDIUM]: {
        modelApiName: 'mistral-medium-latest',
        apiKeyName: API_KEY_CONSTANTS.MISTRAL,
        hasThinking: false,
        freeTier: {
            available: true,
            maxBotsPerGame: -1
        }
    },
    [LLM_CONSTANTS.MISTRAL_MAGISTRAL]: {
        modelApiName: 'magistral-medium-latest',
        apiKeyName: API_KEY_CONSTANTS.MISTRAL,
        hasThinking: true,
        freeTier: {
            available: true,
            maxBotsPerGame: 1
        }
    },

    // Kimi models
    [LLM_CONSTANTS.KIMI_K2]: {
        modelApiName: 'kimi-k2-0905-preview',
        apiKeyName: API_KEY_CONSTANTS.MOONSHOT,
        hasThinking: false,
        freeTier: {
            available: true,
            maxBotsPerGame: -1
        }
    },
    [LLM_CONSTANTS.KIMI_K2_THINKING]: {
        modelApiName: 'kimi-k2-thinking',
        apiKeyName: API_KEY_CONSTANTS.MOONSHOT,
        hasThinking: true,
        freeTier: {
            available: true,
            maxBotsPerGame: -1
        }
    },
    [LLM_CONSTANTS.KIMI_K2_5]: {
        modelApiName: 'kimi-k2.5',
        apiKeyName: API_KEY_CONSTANTS.MOONSHOT,
        hasThinking: false,
        freeTier: {
            available: false,
            maxBotsPerGame: 0
        }
    },
    [LLM_CONSTANTS.KIMI_K2_5_THINKING]: {
        modelApiName: 'kimi-k2.5',
        apiKeyName: API_KEY_CONSTANTS.MOONSHOT,
        hasThinking: true,
        freeTier: {
            available: false,
            maxBotsPerGame: 0
        }
    },
};

export type LLMModel = keyof typeof SupportedAiModels;

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
 * Updated as of January 2025
 */
export const MODEL_PRICING: Record<string, ModelPricing> = {
    // OpenAI models
    [SupportedAiModels[LLM_CONSTANTS.GPT_5].modelApiName]: {
        inputPrice: 1.750,
        outputPrice: 14.000,
        cacheHitPrice: 0.175
    },
    [SupportedAiModels[LLM_CONSTANTS.GPT_5_MINI].modelApiName]: {
        inputPrice: 0.250,
        outputPrice: 2.000,
        cacheHitPrice: 0.025
    },

    // DeepSeek models (both models have the same pricing)
    [SupportedAiModels[LLM_CONSTANTS.DEEPSEEK_CHAT].modelApiName]: {
        inputPrice: 0.28,
        outputPrice: 0.42,
        cacheHitPrice: 0.028
    },
    [SupportedAiModels[LLM_CONSTANTS.DEEPSEEK_REASONER].modelApiName]: {
        inputPrice: 0.28,
        outputPrice: 1.68,
        cacheHitPrice: 0.028
    },

    // Kimi/Moonshot models
    [SupportedAiModels[LLM_CONSTANTS.KIMI_K2].modelApiName]: {
        inputPrice: 0.6,
        outputPrice: 2.50,
        cacheHitPrice: 0.15
    },
    [SupportedAiModels[LLM_CONSTANTS.KIMI_K2_THINKING].modelApiName]: {
        inputPrice: 0.6,
        outputPrice: 2.50,
        cacheHitPrice: 0.15
    },
    [SupportedAiModels[LLM_CONSTANTS.KIMI_K2_5].modelApiName]: {
        inputPrice: 0.60,
        outputPrice: 3.00,
        cacheHitPrice: 0.10
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
        inputPrice: 0.50,
        outputPrice: 3.00,
        cacheHitPrice: 0.05
    },

    // Mistral models
    [SupportedAiModels[LLM_CONSTANTS.MISTRAL_3_LARGE].modelApiName]: {
        inputPrice: 0.5,
        outputPrice: 1.5
    },
    [SupportedAiModels[LLM_CONSTANTS.MISTRAL_3_MEDIUM].modelApiName]: {
        inputPrice: 0.4,
        outputPrice: 2
    },
    [SupportedAiModels[LLM_CONSTANTS.MISTRAL_MAGISTRAL].modelApiName]: {
        inputPrice: 2.0,
        outputPrice: 5.0
    },

    // Grok models (placeholder pricing)
    [SupportedAiModels[LLM_CONSTANTS.GROK_4].modelApiName]: {
        inputPrice: 3.0,
        outputPrice: 15.0,
        cacheHitPrice: 0.75
    },
    [SupportedAiModels[LLM_CONSTANTS.GROK_4_1_FAST_REASONING].modelApiName]: {
        inputPrice: 0.20,
        outputPrice: 0.50
    }
};

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
    if (aiType.startsWith('Claude ')) {
        return { anthropicThinkingSignature: signature };
    }

    // Check if it's a Google (Gemini) model
    if (aiType.startsWith('Gemini ')) {
        return { googleThoughtSignature: signature };
    }

    // Other providers don't support signatures, return empty
    return {};
}
