/**
 * Model catalog and pricing.
 *
 * This is the library's single source of truth for how to talk to each supported model —
 * API name, key name, thinking dialect, per-model tuning defaults (temperature, reasoning
 * effort, thinking budgets, output ceilings) — and what each model costs. Tuning values are
 * operational defaults discovered against the live APIs; consumers can adjust them per model
 * via `createCatalog(overrides)`, but anything that would ever be fixed for *correctness*
 * (a model rejecting a parameter, an effort level eating the output budget) belongs here,
 * so every consumer inherits the fix with a version bump.
 *
 * App-level policy — tier limits, deprecated-id migration, markup — deliberately lives in
 * the consumer, keyed by the same stable model ids.
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
    // the surviving thinking entries took over the plain ids ('claude-opus', 'glm', …).
    // Ids are stable slot names, independent of provider version, so repointing a slot to a
    // newer model doesn't orphan ids persisted by consumers.
    CLAUDE_FABLE: 'claude-fable',
    CLAUDE_4_OPUS: 'claude-opus',
    CLAUDE_4_SONNET: 'claude-sonnet',
    CLAUDE_4_HAIKU: 'claude-haiku',
    DEEPSEEK_V4_FLASH: 'deepseek-flash',
    DEEPSEEK_V4_PRO: 'deepseek-pro',
    // GPT-5.6 family. 'gpt' and 'gpt-mini' are stable picker ids carried over from the
    // GPT-5.5 / GPT-5.4-mini era so existing consumers keep working across the repoint.
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
    GLM_FLASH: 'glm-flash',
    FUGU_ULTRA: 'fugu-ultra',
    // Qwen (QwenCloud/DashScope). Stable picker ids without the version, matching the gpt/gemini
    // pattern, so future repoints don't orphan persisted ids.
    QWEN_MAX: 'qwen-max',
    QWEN_FLASH: 'qwen-flash',
    // MiniMax. Single M3 entry; stable id without the version for the same repoint reason.
    MINIMAX: 'minimax',
}

/**
 * Per-request output ceiling for ordinary requests. Reasoning tokens are billed inside this
 * budget on every provider, so the cap has to clear thinking AND the answer — set below what
 * a request really emits and the *answer* is what gets truncated, producing malformed JSON
 * rather than a cheaper request.
 *
 * NOTE this is a blast-radius cap, not a cost lever: providers bill tokens generated, never
 * the unused ceiling. Lowering it saves nothing on a well-behaved request — it only bounds a
 * runaway one. Reasoning effort and thinking budgets are the knobs that change spend.
 */
export const DEFAULT_MAX_OUTPUT_TOKENS = 8192;

// Speed tags graded from live measurements (one identical prompt per model;
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
    // as thinkingLevel; 3.1 Pro and 3.7 Flash reject 'minimal'), Fugu takes high|xhigh,
    // Z.AI GLM-5.3 takes low|high|max ONLY (the generic Z.AI API reference lists a 7-value
    // scale, but glm-5.3 rejects anything else with a 400), DeepSeek V4 takes low|high|max
    // (medium is aliased to high; default high).
    reasoningEffort?: ReasoningEffort; // Effort-based APIs (Anthropic adaptive thinking, Gemini 3.x)
    thinkingBudgetTokens?: number; // Budget-based APIs (Anthropic enabled thinking, Qwen thinking_budget)
    // Per-request output ceiling, overriding DEFAULT_MAX_OUTPUT_TOKENS. Only set it for models
    // that measurably need more room than a typical request takes (see the DeepSeek entries,
    // whose reasoning tokens share this budget). Every agent honors it via AbstractAgent.
    maxOutputTokens?: number;
    tags?: ModelTag[];
}

export const SupportedAiModels: Record<string, ModelConfig> = {
    // Claude Fable - frontier reasoning model. Thinking is always on (no non-thinking variant).
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

    // DeepSeek V4 models — thinking-only entries (non-thinking variants retired 2026-08-05).
    // reasoningEffort pinned to 'low' 2026-08-30: at the provider default ('high', no budget
    // knob exists) both models emitted ~8 reasoning tokens per answer token in prod
    // (requestStats 30d: flash p50 8.9s / p90 36s, pro p50 18.9s / p90 56s) and a 15-bot story
    // took 68-105s. Latency tracks reasoning length ~linearly, so effort is the only lever.
    [LLM_CONSTANTS.DEEPSEEK_V4_FLASH]: {
        displayName: 'DeepSeek V4 Flash',
        modelApiName: 'deepseek-v4-flash',
        apiKeyName: API_KEY_CONSTANTS.DEEPSEEK,
        hasThinking: true,
        reasoningEffort: 'low',
        // Reasoning tokens share the output budget, so leave room for both CoT and answer.
        maxOutputTokens: 65536,
        tags: ['cheap'],
    },
    [LLM_CONSTANTS.DEEPSEEK_V4_PRO]: {
        displayName: 'DeepSeek V4 Pro',
        modelApiName: 'deepseek-v4-pro',
        apiKeyName: API_KEY_CONSTANTS.DEEPSEEK,
        hasThinking: true,
        reasoningEffort: 'low',
        // Reasoning tokens share the output budget, so leave room for both CoT and answer.
        maxOutputTokens: 65536,
        tags: ['cheap'],
    },

    // Models with always-on reasoning
    // GPT-5.6 family (promoted July 2026 when the limited preview opened up):
    // sol is the flagship, terra the mainline, luna the cheap tier.
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
    // budgeted); bump it to 'low' if its output quality visibly drops.
    [LLM_CONSTANTS.GEMINI_3_PRO]: {
        displayName: 'Gemini 3.1 Pro Preview',
        modelApiName: 'gemini-3.1-pro-preview',
        apiKeyName: API_KEY_CONSTANTS.GOOGLE,
        hasThinking: true,
        reasoningEffort: 'high',
        tags: ['expensive'],
    },
    [LLM_CONSTANTS.GEMINI_3_FLASH]: {
        // Repointed from gemini-3.6-flash 2026-08-13 (stable picker id, same pattern as gpt).
        // 3.7 rejects thinkingLevel 'minimal' (low|medium|high only), unlike 3.5/3.6.
        displayName: 'Gemini 3.7 Flash',
        modelApiName: 'gemini-3.7-flash',
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
    // K3 always reasons at max effort; ~85-90% of its output tokens are reasoning tokens billed
    // at the output rate, so real per-request cost runs well above the sticker output price.
    [LLM_CONSTANTS.KIMI]: {
        displayName: 'Kimi K3',
        modelApiName: 'kimi-k3',
        apiKeyName: API_KEY_CONSTANTS.MOONSHOT,
        hasThinking: true,
        // Temperature is omitted from the request: kimi-k3 rejects any value other than 1.
        // Speed samples: 17s (2026-08-04) and 28.9s (2026-08-05) — graded into the >25s tier.
        tags: ['very-slow', 'expensive'],
    },

    // Z.AI models — thinking-only entry (non-thinking variant retired 2026-08-05)
    // reasoningEffort MUST be set: GLM-5.3 forces reasoning on and defaults the effort to 'max',
    // and its reasoning tokens count against max_tokens. At 'max' a long-context request can
    // burn the whole 8192 budget on reasoning and return finish_reason 'length' with content ""
    // (prod empty-response incidents + live repro, 2026-08-20). 'high' answered the same test
    // prompt with ~10x fewer reasoning tokens.
    [LLM_CONSTANTS.GLM]: {
        displayName: 'GLM-5.3',
        modelApiName: 'glm-5.3',
        apiKeyName: API_KEY_CONSTANTS.Z_AI,
        hasThinking: true,
        temperature: 0.7,
        reasoningEffort: 'high',
        // Headroom for the shared reasoning+answer budget (like the DeepSeek entries), sized
        // at 2x default rather than DeepSeek's 65536 to bound worst-case latency on a slow model.
        maxOutputTokens: 16384,
        tags: ['slow'],
    },
    // GLM-5.3-Flash (added 2026-08-30): the cheap sibling. Same API contract as GLM-5.3 —
    // thinking cannot be disabled and reasoning_effort takes low|high|max only
    // (docs.z.ai/guides/llm/glm-5.3-flash, /guides/capabilities/thinking), so it gets the same
    // 'high' pin and the same reasoning+answer headroom.
    [LLM_CONSTANTS.GLM_FLASH]: {
        displayName: 'GLM-5.3 Flash',
        modelApiName: 'glm-5.3-flash',
        apiKeyName: API_KEY_CONSTANTS.Z_AI,
        hasThinking: true,
        temperature: 0.7,
        reasoningEffort: 'high',
        maxOutputTokens: 16384,
        // Live 2026-08-30 (one sample each): day-2 vote 11.8s, 15-character story 56.2s.
        tags: ['cheap'],
    },

    // Sakana Fugu models — OpenAI-compatible. They reason internally (and bill it as
    // "orchestration" tokens), but never surface reasoning to us: responses come back with
    // reasoning_tokens: 0 and no reasoning_content. So hasThinking is false — there's no
    // thinking content to show and no user-facing thinking toggle. Single entry per model.
    //
    // Base `fugu` was RETIRED 2026-08-04. It was carried as a cheap everyday option at an
    // assumed $1/$3, but reconciling token logs against the Sakana balance showed it actually
    // bills at fugu-ultra's rates: 592K prompt + 54K completion tokens over Aug 1-3 cost $4.80
    // real against $0.85 tracked, a 5.7x undercharge. It is a router with no published price,
    // so the rate is not even guaranteed stable, and its cache hit rate was 9.3% — effectively
    // zero, since every hit came from a duplicate call seconds apart rather than turn-to-turn
    // prefix reuse. Ultra costs the same and is predictable.
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
    // Speed tags from the 2026-08-05 live measurements (two samples each): plus 17.4s/14.5s,
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
    // qwen3.8-flash replaced qwen3.7-flash on 2026-08-30 (same 1M context, 128k max output);
    // qwen3.7-plus was retired the same day — persisted 'qwen-plus' ids resolve to this entry
    // in consumers' deprecated-id maps. Live 2026-08-30 (one sample each): day-2 vote 13.8s,
    // 15-character story 26.4s — same bucket as 3.7-flash, so the tags carry over.
    [LLM_CONSTANTS.QWEN_FLASH]: {
        displayName: 'Qwen3.8 Flash',
        modelApiName: 'qwen3.8-flash',
        apiKeyName: API_KEY_CONSTANTS.QWEN,
        hasThinking: true,
        temperature: 0.7,
        // Uncapped it swung to 3K reasoning tokens (21s); same cap as its siblings.
        thinkingBudgetTokens: 1024,
        tags: ['slow', 'cheap'],
    },

    // MiniMax M3 (OpenAI-compatible endpoint, 1M context). Thinking-only entry: M3's `thinking`
    // param defaults to adaptive (it decides per-request how much to think) and can be disabled,
    // making it hybrid for cost purposes. The agent always sends `reasoning_split: true` so
    // thinking arrives in `reasoning_content` instead of as `<think>` tags inside the answer.
    // Note: unlike Qwen, M3 has NO thinking-budget parameter — adaptive is the only throttle.
    // Speed from the 2026-08-05 live measurement (single sample): 25.3s → the >25s tier.
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

/**
 * Builds a catalog from the library defaults with per-model partial overrides merged on top.
 * The merge is per-model and shallow: `{ glm: { temperature: 0.9 } }` changes only that field
 * and keeps the rest of the default entry. Ids absent from the defaults are added verbatim
 * (they must then be complete ModelConfig entries).
 */
export function createCatalog(overrides: Record<string, Partial<ModelConfig>> = {}): Record<string, ModelConfig> {
    const catalog: Record<string, ModelConfig> = {};
    for (const [id, config] of Object.entries(SupportedAiModels)) {
        catalog[id] = { ...config, ...(overrides[id] ?? {}) };
    }
    for (const [id, config] of Object.entries(overrides)) {
        if (!catalog[id]) {
            catalog[id] = config as ModelConfig;
        }
    }
    return catalog;
}

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

/** Human-readable provider name ("Anthropic", "Grok", …) for a model id, if known. */
export function getModelProviderName(modelId: string): string | undefined {
    const apiKeyName = SupportedAiModels[modelId]?.apiKeyName;
    return apiKeyName ? SupportedAiKeyNames[apiKeyName] : undefined;
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
 * request falls inside one of the UTC windows.
 */
export interface PeakPricing {
    multiplier: number; // e.g. 2 → peak-hour prices are double the regular price
    windowsUtc: Array<[number, number]>; // [startHour, endHour) pairs in UTC, e.g. [[1, 4], [6, 10]]
    /** When set, the windows apply Monday–Friday only: a request that falls on a Saturday or
     *  Sunday in the provider's local timezone (given as a UTC offset in hours) bills at the
     *  base rate all day. */
    weekendOffPeak?: { utcOffsetHours: number };
}

/** True if the timestamp's UTC time-of-day falls inside any [startHour, endHour) window. */
export function isInPeakWindow(timestampMs: number, windowsUtc: Array<[number, number]>): boolean {
    const d = new Date(timestampMs);
    const hour = d.getUTCHours() + d.getUTCMinutes() / 60;
    return windowsUtc.some(([start, end]) => hour >= start && hour < end);
}

/** True if the timestamp falls on a Saturday or Sunday in the timezone at the given UTC offset. */
export function isWeekendAt(timestampMs: number, utcOffsetHours: number): boolean {
    const day = new Date(timestampMs + utcOffsetHours * 3_600_000).getUTCDay();
    return day === 0 || day === 6;
}

/** True if a request at this timestamp bills at the peak multiplier under the schedule. */
export function isPeakBilling(timestampMs: number, peak: PeakPricing): boolean {
    if (peak.weekendOffPeak && isWeekendAt(timestampMs, peak.weekendOffPeak.utcOffsetHours)) {
        return false;
    }
    return isInPeakWindow(timestampMs, peak.windowsUtc);
}

/** DeepSeek's peak-valley schedule: 2× during Beijing 09:00–12:00 and 14:00–18:00
 *  (UTC 1–4, 6–10), Monday–Friday Beijing time only. */
export const DEEPSEEK_PEAK_SCHEDULE: PeakPricing = {
    multiplier: 2,
    windowsUtc: [[1, 4], [6, 10]],
    weekendOffPeak: { utcOffsetHours: 8 },
};

/**
 * Centralized pricing configuration for all AI models
 * All prices are per million (1,000,000) tokens
 */
export const MODEL_PRICING: Record<string, ModelPricing> = {
    // OpenAI GPT-5.6 models
    // Sol repriced 2026-08-30 (developers.openai.com/api/docs/pricing): $4/$20 short context,
    // $8/$30 past the long-context threshold — the same 272k boundary its siblings use.
    // Cache writes ($5/$10) are not modelled; OpenAI caching is automatic and we only see hits.
    [SupportedAiModels[LLM_CONSTANTS.GPT_5_6_SOL].modelApiName]: {
        inputPrice: 4.000,
        outputPrice: 20.000,
        cacheHitPrice: 0.400,
        extendedContextInputPrice: 8.000,
        extendedContextOutputPrice: 30.000,
        extendedContextCacheHitPrice: 0.800,
        extendedContextThresholdTokens: 272_000
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
    // Peak-valley pricing landed: these are the new base (off-peak) rates with a 2× surcharge
    // during UTC 1:00–4:00 and 6:00–10:00, effective provider-side 2026-08-16 16:00 UTC
    // (api-docs.deepseek.com/quick_start/pricing, fetched 2026-08-13; rates re-confirmed
    // 2026-08-30). Since 2026-08-23 00:00 Beijing (UTC+8) the surcharge is weekdays-only:
    // Saturday and Sunday Beijing time bill at the off-peak rate all day (DeepSeek notice email).
    [SupportedAiModels[LLM_CONSTANTS.DEEPSEEK_V4_FLASH].modelApiName]: {
        inputPrice: 0.22,
        outputPrice: 0.66,
        cacheHitPrice: 0.007,
        peakPricing: DEEPSEEK_PEAK_SCHEDULE
    },
    [SupportedAiModels[LLM_CONSTANTS.DEEPSEEK_V4_PRO].modelApiName]: {
        inputPrice: 0.66,
        outputPrice: 1.98,
        cacheHitPrice: 0.022,
        peakPricing: DEEPSEEK_PEAK_SCHEDULE
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
    // GLM-5.3-Flash list rates (docs.z.ai/guides/overview/pricing, 2026-08-30). The page shows a
    // 50% promo ($0.075 / $0.015 / $0.25) ending 2026-09-09 24:00 UTC+8; we bill the list rate
    // rather than track a ten-day promo.
    [SupportedAiModels[LLM_CONSTANTS.GLM_FLASH].modelApiName]: {
        inputPrice: 0.15,
        outputPrice: 0.50,
        cacheHitPrice: 0.03
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
        // Launch pricing through 2026-12-31; doubles to $1.50/$7.50/$0.15 on 2027-01-01
        // (ai.google.dev pricing page, fetched 2026-08-13) — ACTION NEEDED then: update these
        // rates.
        // Cache storage cost ($0.50 / 1M tokens per hour) is not tracked here — the
        // schema only models per-token call costs, not time-based storage.
        inputPrice: 0.75,
        outputPrice: 3.75,
        cacheHitPrice: 0.075
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
    // measured out at these same ultra rates, so it has no pricing entry.
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

    // Qwen models. Rates from the official pricing page (qwencloud.com/pricing/api, read
    // 2026-08-30 — the page is client-rendered, so it was read by eye, not WebFetch):
    // qwen3.8-max $2/$6 with implicit-cache hits at $0.25; qwen3.8-flash $0.15/$0.47, hits
    // $0.016. Neither has input-length tiers (the tier column is "-" for both). These
    // published cached rates supersede the 20%-of-input rule charged before 2026-08-30; we
    // still don't send explicit cache_control.
    [SupportedAiModels[LLM_CONSTANTS.QWEN_MAX].modelApiName]: {
        inputPrice: 2.0,
        outputPrice: 6.0,
        cacheHitPrice: 0.25
    },
    [SupportedAiModels[LLM_CONSTANTS.QWEN_FLASH].modelApiName]: {
        inputPrice: 0.15,
        outputPrice: 0.47,
        cacheHitPrice: 0.016
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

/** modelApiNames of hybrid models: their APIs offer a thinking toggle, but the catalog ships them
 *  thinking-only (non-thinking variants retired 2026-08-05). A hybrid model run with thinking on
 *  burns extra reasoning tokens at the output rate, so its effective output price is a multiple
 *  of the sticker price — consumers that budget on price use this to know which models that
 *  applies to. This is hand-maintained: it can no longer be derived from the catalog, since no
 *  non-thinking siblings exist to derive it from. */
const HYBRID_THINKING_API_NAMES = new Set([
    SupportedAiModels[LLM_CONSTANTS.CLAUDE_4_OPUS].modelApiName,
    SupportedAiModels[LLM_CONSTANTS.CLAUDE_4_SONNET].modelApiName,
    SupportedAiModels[LLM_CONSTANTS.CLAUDE_4_HAIKU].modelApiName,
    SupportedAiModels[LLM_CONSTANTS.DEEPSEEK_V4_FLASH].modelApiName,
    SupportedAiModels[LLM_CONSTANTS.DEEPSEEK_V4_PRO].modelApiName,
    SupportedAiModels[LLM_CONSTANTS.GLM].modelApiName,
    SupportedAiModels[LLM_CONSTANTS.GLM_FLASH].modelApiName,
    // Qwen ships thinking-only from day one, but the API's enable_thinking toggle makes these
    // hybrid by the same definition: we force reasoning on, so they carry the multiplier.
    SupportedAiModels[LLM_CONSTANTS.QWEN_MAX].modelApiName,
    SupportedAiModels[LLM_CONSTANTS.QWEN_FLASH].modelApiName,
    SupportedAiModels[LLM_CONSTANTS.MINIMAX].modelApiName,
]);

/** True for hybrid thinking-only models — the ones whose effective output price is a known
 *  multiple of the sticker price. Always-on reasoning models (GPT-5, Gemini, Grok, Kimi,
 *  Fable, Magistral) also burn reasoning tokens, but their multiplier hasn't been measured. */
export function isHybridThinkingModel(modelApiName: string): boolean {
    return HYBRID_THINKING_API_NAMES.has(modelApiName);
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
        isPeakBilling(options.timestamp ?? Date.now(), pricing.peakPricing)
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
 * Returns provider-specific signature fields based on the model's API name prefix.
 * Used when storing messages with thinking signatures from different providers.
 * @param aiType - The model API name (e.g. "claude-sonnet-5", "gemini-3.7-flash")
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
