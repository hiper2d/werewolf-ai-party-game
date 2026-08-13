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
    FUGU: 'FUGU_API_KEY',
    QWEN: 'QWEN_API_KEY',
    MINIMAX: 'MINIMAX_API_KEY'
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
    [API_KEY_CONSTANTS.FUGU]: 'Sakana Fugu',
    [API_KEY_CONSTANTS.QWEN]: 'Qwen',
    [API_KEY_CONSTANTS.MINIMAX]: 'MiniMax'
};

export const LLM_CONSTANTS = {
    // Thinking-only catalog since 2026-08-05: models whose API offers a thinking toggle used to
    // ship as separate with/without picker entries. The non-thinking variants were retired and
    // the surviving thinking entries took over the plain ids ('claude-opus', 'glm', …); the old
    // '-thinking' ids persisted in game docs resolve via DEPRECATED_MODEL_MAP.
    CLAUDE_FABLE: 'claude-fable',
    CLAUDE_4_OPUS: 'claude-opus',
    CLAUDE_4_SONNET: 'claude-sonnet',
    CLAUDE_4_HAIKU: 'claude-haiku',
    DEEPSEEK_V4_FLASH: 'deepseek-flash',
    DEEPSEEK_V4_PRO: 'deepseek-pro',
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
    GROK_4_6: 'grok',
    KIMI: 'kimi',
    GLM: 'glm',
    FUGU_ULTRA: 'fugu-ultra',
    // Qwen (QwenCloud/DashScope). Stable picker ids without the version, matching the gpt/gemini
    // pattern, so future repoints don't orphan persisted game docs.
    QWEN_MAX: 'qwen-max',
    QWEN_PLUS: 'qwen-plus',
    QWEN_FLASH: 'qwen-flash',
    // MiniMax. Single M3 entry; stable id without the version for the same repoint reason.
    MINIMAX: 'minimax',
    RANDOM: 'random',
}

export const AUDIO_MODEL_CONSTANTS = {
    TTS: 'gpt-4o-mini-tts',
    STT: 'whisper-1',
} as const;

/**
 * Per-request output ceiling for ordinary game turns (bot answers, votes, night actions,
 * GM bot-selection). Reasoning tokens are billed inside this budget on every provider, so
 * the cap has to clear thinking AND the answer — set below what a turn really emits and the
 * *answer* is what gets truncated, producing malformed JSON rather than a cheaper turn.
 *
 * 8192 is ~2.5x the largest turn measured in `requestStats` over 30 days (3,337 output
 * tokens, claude-haiku-4-5); p99 across all models was 3,337 and p90 was 1,376. Re-measure
 * with `scripts/output-token-percentiles.ts` before moving it.
 *
 * NOTE this is a blast-radius cap, not a cost lever: providers bill tokens generated, never
 * the unused ceiling. Lowering it saves nothing on a well-behaved turn — it only bounds a
 * runaway one. Reasoning effort and thinking budgets are the knobs that change spend.
 */
export const DEFAULT_MAX_OUTPUT_TOKENS = 8192;

/**
 * Story generation emits a whole game setup in one response — a character object per bot
 * (name, story, play style, voice, gender) for up to a dozen bots — so it needs far more
 * room than a turn. It bills directly rather than through `recordGameMasterTokenUsage`, so
 * it produces no `requestStats` rows and is absent from the measurements above; this keeps
 * the 16k it has always run with rather than guessing a smaller number from no data.
 */
export const STORY_MAX_OUTPUT_TOKENS = 16384;

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

// Speed tags graded from live measurements (one identical day-2 vote per model, all-models.test;
// re-graded 2026-08-04, very-slow tier added 2026-08-05): very-fast < 3s, fast 3-6s,
// slow 15-25s, very-slow > 25s (the K3 / Qwen Max / MiniMax cluster), extremely-slow = minutes
// (Fugu Ultra exclusively). Models in the 6-13s middle carry NO speed tag on purpose — "medium"
// is the unlabeled default. Single-sample measurements: trust the bucket, not fine ordering.
export type ModelTag = 'very-fast' | 'fast' | 'slow' | 'very-slow' | 'extremely-slow' | 'cheap' | 'expensive';

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
    // minimal|low|medium|high|xhigh, Gemini 3.x takes minimal|low|medium|high (sent uppercase
    // as thinkingLevel), Fugu takes high|xhigh.
    reasoningEffort?: ReasoningEffort; // Effort-based APIs (Anthropic adaptive thinking, Gemini 3.x)
    thinkingBudgetTokens?: number; // Budget-based APIs (Anthropic enabled thinking, Qwen thinking_budget)
    // Per-request output ceiling, overriding DEFAULT_MAX_OUTPUT_TOKENS. Only set it for models
    // that measurably need more room than a game turn takes (see the DeepSeek entries, whose
    // reasoning tokens share this budget). Every agent honors it via AbstractAgent.
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
        tags: ['expensive'],
    },

    // Claude models — thinking-only entries (non-thinking variants retired 2026-08-05)
    [LLM_CONSTANTS.CLAUDE_4_OPUS]: {
        displayName: 'Claude 5 Opus',
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
        hasThinking: true,
        reasoningEffort: 'high',
        tags: ['expensive'],
    },
    [LLM_CONSTANTS.CLAUDE_4_HAIKU]: {
        displayName: 'Claude 4.5 Haiku',
        modelApiName: 'claude-haiku-4-5',
        apiKeyName: API_KEY_CONSTANTS.ANTHROPIC,
        hasThinking: true,
        thinkingBudgetTokens: 1024,
        tags: ['slow', 'cheap'],
    },

    // DeepSeek V4 models — thinking-only entries (non-thinking variants retired 2026-08-05)
    [LLM_CONSTANTS.DEEPSEEK_V4_FLASH]: {
        displayName: 'DeepSeek V4 Flash',
        modelApiName: 'deepseek-v4-flash',
        apiKeyName: API_KEY_CONSTANTS.DEEPSEEK,
        hasThinking: true,
        // Reasoning tokens share the output budget, so leave room for both CoT and answer.
        maxOutputTokens: 65536,
        tags: ['cheap'],
    },
    [LLM_CONSTANTS.DEEPSEEK_V4_PRO]: {
        displayName: 'DeepSeek V4 Pro',
        modelApiName: 'deepseek-v4-pro',
        apiKeyName: API_KEY_CONSTANTS.DEEPSEEK,
        hasThinking: true,
        // Reasoning tokens share the output budget, so leave room for both CoT and answer.
        maxOutputTokens: 65536,
        tags: ['cheap'],
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
        tags: ['fast', 'expensive'],
    },
    [LLM_CONSTANTS.GPT_5_6_LUNA]: {
        displayName: 'GPT-5.6 Luna',
        modelApiName: 'gpt-5.6-luna',
        apiKeyName: API_KEY_CONSTANTS.OPENAI,
        hasThinking: true,
        temperature: 1,
        tags: ['fast', 'cheap'],
    },
    // Gemini 3.x reasons via the effort dialect (thinkingLevel). The level is a CEILING on an
    // always-dynamic process — the model still scales actual thinking depth per request within
    // it; "high" is the fully open dynamic range. Levels below are each model's documented
    // default (Pro accepts low|medium|high only — no minimal). This replaced the deprecated
    // 2.5-era thinkingBudget: 1024 (2026-08-06), which HAD been binding — so Flash Lite now
    // thinks noticeably less under its "minimal" default (0.8s/49-token votes vs 4.5s/650
    // budgeted); bump it to 'low' if its play quality visibly drops.
    [LLM_CONSTANTS.GEMINI_3_PRO]: {
        displayName: 'Gemini 3.1 Pro Preview',
        modelApiName: 'gemini-3.1-pro-preview',
        apiKeyName: API_KEY_CONSTANTS.GOOGLE,
        hasThinking: true,
        reasoningEffort: 'high',
        tags: ['expensive'],
    },
    [LLM_CONSTANTS.GEMINI_3_FLASH]: {
        displayName: 'Gemini 3.6 Flash',
        modelApiName: 'gemini-3.6-flash',
        apiKeyName: API_KEY_CONSTANTS.GOOGLE,
        hasThinking: true,
        reasoningEffort: 'medium',
        tags: ['fast'],
    },
    [LLM_CONSTANTS.GEMINI_3_FLASH_LITE]: {
        displayName: 'Gemini 3.5 Flash Lite',
        modelApiName: 'gemini-3.5-flash-lite',
        apiKeyName: API_KEY_CONSTANTS.GOOGLE,
        hasThinking: true,
        reasoningEffort: 'minimal',
        tags: ['fast', 'cheap'],
    },
    // Always-on reasoning (xAI default effort "high", cannot be disabled) — no non-thinking sibling
    [LLM_CONSTANTS.GROK_4_6]: {
        displayName: 'Grok 4.6',
        modelApiName: 'grok-4.6',
        apiKeyName: API_KEY_CONSTANTS.GROK,
        hasThinking: true,
        temperature: 0.7,
    },

    // Mistral models
    [LLM_CONSTANTS.MISTRAL_3_LARGE]: {
        displayName: 'Mistral Large 3',
        modelApiName: 'mistral-large-latest',
        apiKeyName: API_KEY_CONSTANTS.MISTRAL,
        hasThinking: false,
        tags: ['fast'],
    },
    [LLM_CONSTANTS.MISTRAL_3_5_MEDIUM]: {
        displayName: 'Mistral Medium 3.5',
        modelApiName: 'mistral-medium-3',
        apiKeyName: API_KEY_CONSTANTS.MISTRAL,
        hasThinking: false,
        tags: ['very-fast', 'expensive'],
    },
    [LLM_CONSTANTS.MISTRAL_4_SMALL]: {
        displayName: 'Mistral 4 Small',
        modelApiName: 'mistral-small-latest',
        apiKeyName: API_KEY_CONSTANTS.MISTRAL,
        hasThinking: false,
        tags: ['very-fast', 'cheap'],
    },
    [LLM_CONSTANTS.MISTRAL_MAGISTRAL]: {
        displayName: 'Magistral Medium 1.2',
        modelApiName: 'magistral-medium-latest',
        apiKeyName: API_KEY_CONSTANTS.MISTRAL,
        hasThinking: true,
        // Measured very-fast (1.6s) because JSON response mode suppresses its thinking
        // (see mistral-agent.ts) — it effectively runs as a non-reasoning model here.
        tags: ['very-fast'],
    },

    // Kimi models. Single always-reasoning entry: K3 reasons by default and the only way to stop
    // it is the undocumented K2-era `thinking: disabled` toggle, which we no longer rely on.
    [LLM_CONSTANTS.KIMI]: {
        displayName: 'Kimi K3',
        modelApiName: 'kimi-k3',
        apiKeyName: API_KEY_CONSTANTS.MOONSHOT,
        hasThinking: true,
        // Temperature is omitted from the request: kimi-k3 rejects any value other than 1.
        // Speed samples: 17s (2026-08-04) and 28.9s (2026-08-05) — graded into the >25s tier.
        tags: ['very-slow', 'expensive'],
        // Explicit policy, opting out of price banding. Banding on the $15 sticker output price
        // would land K3 exactly on the SINGLE_MAX boundary (1 bot), but that price understates
        // what a turn really costs: K3 always reasons at max effort, and ~85-90% of its output
        // tokens are reasoning tokens billed at the output rate. It dodges the usual
        // FREE_TIER_THINKING_COST_FACTOR only because it has no non-thinking sibling entry;
        // with that factor it would be $37.50 effective, far past the free-tier ceiling.
        freeTier: { available: false, maxBotsPerGame: 0 },
    },

    // Z.AI models — thinking-only entry (non-thinking variant retired 2026-08-05)
    [LLM_CONSTANTS.GLM]: {
        displayName: 'GLM-5.2',
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
    //
    // Base `fugu` was RETIRED 2026-08-04 (see DEPRECATED_MODEL_MAP). It was carried as a cheap
    // everyday option at an assumed $1/$3, but reconciling BetterStack token logs against the
    // Sakana balance showed it actually bills at fugu-ultra's rates: 592K prompt + 54K completion
    // tokens over Aug 1-3 cost $4.80 real against $0.85 tracked, a 5.7x undercharge. It is a
    // router with no published price, so the rate is not even guaranteed stable, and its cache
    // hit rate was 9.3% — effectively zero, since every hit came from a duplicate call seconds
    // apart rather than turn-to-turn prefix reuse. Ultra costs the same and is predictable.
    [LLM_CONSTANTS.FUGU_ULTRA]: {
        displayName: 'Sakana Fugu Ultra',
        modelApiName: 'fugu-ultra',
        apiKeyName: API_KEY_CONSTANTS.FUGU,
        hasThinking: false,
        tags: ['extremely-slow', 'expensive'],
    },

    // Qwen models (QwenCloud, OpenAI-compatible endpoint). Added 2026-08-05 straight into the
    // thinking-only catalog: their API has an `enable_thinking` toggle, we always send true, and
    // thinking arrives in `reasoning_content` (verified live against all three, non-streaming).
    // Speed tags from the 2026-08-05 live day-2 votes (two samples each): plus 17.4s/14.5s,
    // flash 14.3s/16.4s (both slow); max 30.6s/100.5s — its latency tracks how long it decides
    // to think (4.2K reasoning tokens on the slow run), hence the budget cap below.
    [LLM_CONSTANTS.QWEN_MAX]: {
        displayName: 'Qwen3.8 Max',
        modelApiName: 'qwen3.8-max',
        apiKeyName: API_KEY_CONSTANTS.QWEN,
        hasThinking: true,
        temperature: 0.7,
        // Caps `thinking_budget` to bound the 30–100s latency variance. The same knob works on
        // the 3.7 models (verified live) — add it to their entries if they ever need taming.
        thinkingBudgetTokens: 1024,
        // Capped it measures 25-26s → the >25s tier.
        tags: ['very-slow'],
    },
    [LLM_CONSTANTS.QWEN_PLUS]: {
        displayName: 'Qwen3.7 Plus',
        modelApiName: 'qwen3.7-plus',
        apiKeyName: API_KEY_CONSTANTS.QWEN,
        hasThinking: true,
        temperature: 0.7,
        thinkingBudgetTokens: 1024,
        tags: ['slow', 'cheap'],
    },
    [LLM_CONSTANTS.QWEN_FLASH]: {
        displayName: 'Qwen3.7 Flash',
        modelApiName: 'qwen3.7-flash',
        apiKeyName: API_KEY_CONSTANTS.QWEN,
        hasThinking: true,
        temperature: 0.7,
        // Uncapped it swung to 3K reasoning tokens (21s); same cap as its siblings.
        thinkingBudgetTokens: 1024,
        tags: ['slow', 'cheap'],
    },

    // MiniMax M3 (OpenAI-compatible endpoint, 1M context). Thinking-only entry: M3's `thinking`
    // param defaults to adaptive (it decides per-request how much to think) and can be disabled,
    // making it hybrid for free-tier banding. The agent always sends `reasoning_split: true` so
    // thinking arrives in `reasoning_content` instead of as `<think>` tags inside the answer.
    // Note: unlike Qwen, M3 has NO thinking-budget parameter — adaptive is the only throttle.
    // Speed from the 2026-08-05 live day-2 vote (single sample): 25.3s → the >25s tier.
    // Temperature: MiniMax range is [0,2], default 1.
    [LLM_CONSTANTS.MINIMAX]: {
        displayName: 'MiniMax M3',
        modelApiName: 'MiniMax-M3',
        apiKeyName: API_KEY_CONSTANTS.MINIMAX,
        hasThinking: true,
        temperature: 1,
        tags: ['very-slow', 'cheap'],
    },
};

export type LLMModel = keyof typeof SupportedAiModels;

export function getModelTags(modelId: string): ModelTag[] {
    return SupportedAiModels[modelId]?.tags ?? [];
}

export function modelHasTag(modelId: string, tag: ModelTag): boolean {
    return getModelTags(modelId).includes(tag);
}

/** Speed is an ordered scale — "fast" filters must also admit very-fast models. */
export function modelIsFast(modelId: string): boolean {
    return modelHasTag(modelId, 'fast') || modelHasTag(modelId, 'very-fast');
}

export function getModelDisplayName(modelId: string): string {
    return SupportedAiModels[modelId]?.displayName ?? modelId;
}

/**
 * Looks up a model's config by API name. Since the catalog went thinking-only (2026-08-05) each
 * modelApiName has a single entry, so hasThinking no longer disambiguates anything; it is kept
 * for call-site compatibility and as a filter should variants ever return.
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
    peakPricing?: PeakPricing; // Optional: time-of-day surcharge (e.g. DeepSeek peak-valley pricing)
}

/**
 * Time-of-day surcharge applied to all billing items (input, output, cache) when the
 * request falls inside one of the UTC windows. Free-tier banding intentionally ignores
 * this and uses the regular (off-peak) output price.
 */
export interface PeakPricing {
    multiplier: number; // e.g. 2 → peak-hour prices are double the regular price
    windowsUtc: Array<[number, number]>; // [startHour, endHour) pairs in UTC, e.g. [[1, 4], [6, 10]]
}

/** True if the timestamp's UTC time-of-day falls inside any [startHour, endHour) window. */
export function isInPeakWindow(timestampMs: number, windowsUtc: Array<[number, number]>): boolean {
    const d = new Date(timestampMs);
    const hour = d.getUTCHours() + d.getUTCMinutes() / 60;
    return windowsUtc.some(([start, end]) => hour >= start && hour < end);
}

/**
 * Centralized pricing configuration for all AI models
 * All prices are per million (1,000,000) tokens
 * Updated as of July 2026
 */
export const MODEL_PRICING: Record<string, ModelPricing> = {
    // OpenAI GPT-5.6 models
    [SupportedAiModels[LLM_CONSTANTS.GPT_5_6_SOL].modelApiName]: {
        inputPrice: 5.000,
        outputPrice: 30.000,
        cacheHitPrice: 0.500
    },
    [SupportedAiModels[LLM_CONSTANTS.GPT_5_6_TERRA].modelApiName]: {
        inputPrice: 2.000,
        outputPrice: 12.000,
        cacheHitPrice: 0.200,
        extendedContextInputPrice: 4.000,
        extendedContextOutputPrice: 18.000,
        extendedContextCacheHitPrice: 0.400,
        extendedContextThresholdTokens: 272_000
    },
    [SupportedAiModels[LLM_CONSTANTS.GPT_5_6_LUNA].modelApiName]: {
        inputPrice: 0.200,
        outputPrice: 1.200,
        cacheHitPrice: 0.020,
        extendedContextInputPrice: 0.400,
        extendedContextOutputPrice: 1.800,
        extendedContextCacheHitPrice: 0.040,
        extendedContextThresholdTokens: 272_000
    },

    // DeepSeek V4 models
    // DeepSeek has announced peak-valley pricing (2× on all billing items during UTC 1:00–4:00
    // and 6:00–10:00) but no effective date yet ("subject to official notice"). When it lands,
    // add to both entries:  peakPricing: { multiplier: 2, windowsUtc: [[1, 4], [6, 10]] }
    // Free-tier bands are unaffected either way — even at 2× both models stay in their bands.
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
        inputPrice: 2.0,
        outputPrice: 10.0,
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

    // Mistral models. Cached tokens bill at 10% of the input price (documented on the
    // prompt_cache_key param in the API reference; no per-model cached prices published).
    [SupportedAiModels[LLM_CONSTANTS.MISTRAL_3_LARGE].modelApiName]: {
        inputPrice: 0.5,
        outputPrice: 1.5,
        cacheHitPrice: 0.05
    },
    [SupportedAiModels[LLM_CONSTANTS.MISTRAL_3_5_MEDIUM].modelApiName]: {
        inputPrice: 1.5,
        outputPrice: 7.5,
        cacheHitPrice: 0.15
    },
    [SupportedAiModels[LLM_CONSTANTS.MISTRAL_4_SMALL].modelApiName]: {
        inputPrice: 0.15,
        outputPrice: 0.6,
        cacheHitPrice: 0.015
    },
    [SupportedAiModels[LLM_CONSTANTS.MISTRAL_MAGISTRAL].modelApiName]: {
        inputPrice: 2.0,
        outputPrice: 5.0,
        cacheHitPrice: 0.2
    },

    // Grok models. Cached price is per-model on xAI (not a uniform ratio):
    // grok-4.6 is $0.50/M cached vs $2.00/M input, and all rates double for prompts
    // >= 200K tokens, per docs.x.ai/developers/models (verified 2026-08-12).
    [SupportedAiModels[LLM_CONSTANTS.GROK_4_6].modelApiName]: {
        inputPrice: 2.0,
        outputPrice: 6.0,
        cacheHitPrice: 0.50,
        extendedContextInputPrice: 4.0,
        extendedContextOutputPrice: 12.0,
        extendedContextCacheHitPrice: 1.0,
        extendedContextThresholdTokens: 200_000
    },

    // Sakana Fugu models. Base `fugu` was retired 2026-08-04 — it had no published price and
    // measured out at these same ultra rates, so it has no pricing entry; DEPRECATED_MODEL_MAP
    // resolves any persisted `fugu` id here.
    // fugu-ultra has published pricing. Above 272K context the rates roughly double.
    [SupportedAiModels[LLM_CONSTANTS.FUGU_ULTRA].modelApiName]: {
        inputPrice: 5.0,
        outputPrice: 30.0,
        cacheHitPrice: 0.50,
        extendedContextInputPrice: 10.0,
        extendedContextOutputPrice: 45.0,
        extendedContextCacheHitPrice: 1.00,
        extendedContextThresholdTokens: 272_000
    },

    // Qwen models. Cache-hit rates follow QwenCloud's implicit-cache rule: hits bill at 20% of
    // the input price (docs.qwencloud.com → Context cache); we don't send explicit cache_control.
    // qwen3.8-max: $2/$6 is from the launch coverage/OpenRouter (2026-08-03) — the official docs
    // defer to the Model Marketplace, which WebFetch can't read. Third parties quote $0.25 cached,
    // which contradicts the 20% rule ($0.40); we charge the documented 20% to avoid a Fugu-style
    // undercharge. Reconcile both against the console bill after the first real games.
    [SupportedAiModels[LLM_CONSTANTS.QWEN_MAX].modelApiName]: {
        inputPrice: 2.0,
        outputPrice: 6.0,
        cacheHitPrice: 0.40
    },
    [SupportedAiModels[LLM_CONSTANTS.QWEN_PLUS].modelApiName]: {
        inputPrice: 0.40,
        outputPrice: 1.60,
        cacheHitPrice: 0.08,
        extendedContextInputPrice: 1.20,
        extendedContextOutputPrice: 4.80,
        extendedContextCacheHitPrice: 0.24,
        extendedContextThresholdTokens: 256_000
    },
    // qwen3.7-flash actually has THREE price tiers (≤32K: 0.03/0.13, 32K–256K: 0.10/0.40,
    // 256K–1M: 0.20/0.80) but the schema supports one threshold. We model the first boundary and
    // bill the middle tier above it, knowingly undercharging 2× past 256K — game contexts
    // essentially never get there, and the absolute rates are tiny either way.
    [SupportedAiModels[LLM_CONSTANTS.QWEN_FLASH].modelApiName]: {
        inputPrice: 0.03,
        outputPrice: 0.13,
        cacheHitPrice: 0.006,
        extendedContextInputPrice: 0.10,
        extendedContextOutputPrice: 0.40,
        extendedContextCacheHitPrice: 0.02,
        extendedContextThresholdTokens: 32_000
    },

    // MiniMax M3. Rates from platform.minimax.io/docs/guides/pricing-paygo (2026-08-05, USD,
    // "permanent 50% off" already applied): ≤512k and >512k input tiers. Caching is automatic
    // (≥512 input tokens), hits reported in prompt_tokens_details.cached_tokens; no write fee
    // for M3.
    [SupportedAiModels[LLM_CONSTANTS.MINIMAX].modelApiName]: {
        inputPrice: 0.30,
        outputPrice: 1.20,
        cacheHitPrice: 0.06,
        extendedContextInputPrice: 0.60,
        extendedContextOutputPrice: 2.40,
        extendedContextCacheHitPrice: 0.12,
        extendedContextThresholdTokens: 512_000
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
 * Hybrid models — models whose API can run without thinking but that we ship as thinking-only
 * entries (the non-thinking picker variants were retired 2026-08-05) — burn extra reasoning
 * tokens at the same per-token price, so their effective output price is multiplied by
 * THINKING_COST_FACTOR before banding, exactly as their "(Thinking)" variants always were.
 * Always-on reasoning models (GPT-5, Gemini 3, Magistral) are priced as listed.
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
    'deepseek-reasoner': LLM_CONSTANTS.DEEPSEEK_V4_FLASH,
    'grok-fast': LLM_CONSTANTS.GROK_4_6,
    'grok-thinking': LLM_CONSTANTS.GROK_4_6,
    // Kimi collapsed to a single always-reasoning K3 entry.
    'kimi-thinking': LLM_CONSTANTS.KIMI,
    // Catalog went thinking-only 2026-08-05: the non-thinking variants were retired and the
    // thinking entries took over the plain ids. A persisted plain id ('claude-opus', 'glm', …)
    // is therefore still live — it now just always runs with reasoning enabled — while the old
    // '-thinking' ids resolve back to those plain ids here.
    'claude-opus-thinking': LLM_CONSTANTS.CLAUDE_4_OPUS,
    'claude-sonnet-thinking': LLM_CONSTANTS.CLAUDE_4_SONNET,
    'claude-haiku-thinking': LLM_CONSTANTS.CLAUDE_4_HAIKU,
    'deepseek-flash-thinking': LLM_CONSTANTS.DEEPSEEK_V4_FLASH,
    'deepseek-pro-thinking': LLM_CONSTANTS.DEEPSEEK_V4_PRO,
    'glm-thinking': LLM_CONSTANTS.GLM,
    // Base `fugu` retired 2026-08-04: it billed at ultra's rates anyway (see the Fugu comment in
    // MODEL_PRICING), so persisted bots resolve to the model they were effectively already paying
    // for. NOTE fugu-ultra is not free-tier eligible ($30 output), so a free-tier game still
    // holding a migrated bot plays fine (agent creation resolves the id) but its model picker and
    // "Retry with different model" will reject until that bot is switched — validateModelUsageForTier
    // re-checks every bot in the game, not just the one being changed.
    'fugu': LLM_CONSTANTS.FUGU_ULTRA,
};

/** Maps a possibly-retired model ID to its current equivalent; unknown IDs pass through. */
export function resolveModelId(modelId: string): string {
    return DEPRECATED_MODEL_MAP[modelId] ?? modelId;
}

export const FREE_TIER_OUTPUT_PRICE_BANDS = {
    UNLIMITED_MAX: 2,   // <= $2/1M output → unlimited bots
    // Bumped 5 → 6 with the GPT-5.6 promotion; Luna has since dropped to $1.20 output
    // (unlimited band), so Grok 4.6 ($6 output) is now what holds this band at 6.
    LIMITED_MAX: 6,     // <= $6 → up to LIMITED_MAX_BOTS bots
    SINGLE_MAX: 15,     // <= $15 → 1 bot; above → not available on free tier
} as const;
export const FREE_TIER_LIMITED_MAX_BOTS = 3;
// A reasoning model bills its (hidden) thinking tokens at the output rate on top of the visible
// answer, so a turn costs more than the sticker output price implies. This multiplier approximates
// that overhead — a model's "effective" output cost ≈ outputPrice × factor on average. It's the
// extra cost of running a model in reasoning mode, and it's what free-tier budgeting is based on.
export const FREE_TIER_THINKING_COST_FACTOR = 2.5;

/** modelApiNames of hybrid models: their APIs offer a thinking toggle, but the catalog ships them
 *  thinking-only (non-thinking variants retired 2026-08-05). Their entries keep paying the
 *  reasoning-cost multiplier so free-tier banding matches what these thinking variants cost
 *  before the retirement — banding them on sticker price would silently expand free-tier cost.
 *  This is hand-maintained now: it can no longer be derived from the catalog, since no
 *  non-thinking siblings exist to derive it from. */
const HYBRID_THINKING_API_NAMES = new Set([
    SupportedAiModels[LLM_CONSTANTS.CLAUDE_4_OPUS].modelApiName,
    SupportedAiModels[LLM_CONSTANTS.CLAUDE_4_SONNET].modelApiName,
    SupportedAiModels[LLM_CONSTANTS.CLAUDE_4_HAIKU].modelApiName,
    SupportedAiModels[LLM_CONSTANTS.DEEPSEEK_V4_FLASH].modelApiName,
    SupportedAiModels[LLM_CONSTANTS.DEEPSEEK_V4_PRO].modelApiName,
    SupportedAiModels[LLM_CONSTANTS.GLM].modelApiName,
    // Qwen ships thinking-only from day one, but the API's enable_thinking toggle makes these
    // hybrid by the same definition: we force reasoning on, so they pay the multiplier.
    SupportedAiModels[LLM_CONSTANTS.QWEN_MAX].modelApiName,
    SupportedAiModels[LLM_CONSTANTS.QWEN_PLUS].modelApiName,
    SupportedAiModels[LLM_CONSTANTS.QWEN_FLASH].modelApiName,
    SupportedAiModels[LLM_CONSTANTS.MINIMAX].modelApiName,
]);

/** True for hybrid thinking-only models, i.e. the ones whose ×FREE_TIER_THINKING_COST_FACTOR
 *  effective output price is a known quantity (it's what free-tier banding uses). Always-on
 *  reasoning models (GPT-5, Gemini, Grok, Kimi, Fable, Magistral) also burn reasoning tokens,
 *  but their multiplier hasn't been measured — don't display or bill an effective price for
 *  them until usage statistics establish one. */
export function isHybridThinkingModel(modelApiName: string): boolean {
    return HYBRID_THINKING_API_NAMES.has(modelApiName);
}

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
    const isOptionalThinkingVariant = hasThinking && HYBRID_THINKING_API_NAMES.has(modelApiName);
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
    timestamp?: number; // When the request was billed; defaults to now. Only affects peakPricing models.
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

    if (
        pricing.peakPricing &&
        isInPeakWindow(options.timestamp ?? Date.now(), pricing.peakPricing.windowsUtc)
    ) {
        activeInputPrice *= pricing.peakPricing.multiplier;
        activeOutputPrice *= pricing.peakPricing.multiplier;
        activeCachePrice *= pricing.peakPricing.multiplier;
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
