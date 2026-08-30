/**
 * Werewolf's model configuration: the @hiper2d/ai-agents catalog plus app policy.
 *
 * The library owns the facts and tuning defaults (model API names, thinking dialects,
 * reasoning effort, output ceilings, prices). This module overlays what is werewolf's
 * business, not the library's: free-tier availability bands, the RANDOM picker entry,
 * deprecated-id migration for persisted game docs, and the audio/image pipeline models.
 */

import {
    LLM_CONSTANTS as LIB_LLM_CONSTANTS,
    ModelConfig as LibModelConfig,
    SupportedAiModels as DEFAULT_MODEL_CATALOG,
    MODEL_PRICING,
    isHybridThinkingModel,
    type AbstractAgent,
} from '@hiper2d/ai-agents';

// Generic catalog + pricing surface, re-exported so existing '@/app/ai/ai-models' imports
// keep working unchanged.
//
// On DEFAULT_MAX_OUTPUT_TOKENS (now a library default): werewolf's measurement basis is
// 8192 ≈ 2.5x the largest turn seen in `requestStats` over 30 days (3,337 output tokens,
// claude-haiku-4-5); p99 across all models was 3,337 and p90 was 1,376. Re-measure with
// `scripts/output-token-percentiles.ts` before campaigning to move the library default.
export {
    API_KEY_CONSTANTS,
    SupportedAiKeyNames,
    DEFAULT_MAX_OUTPUT_TOKENS,
    getModelTags,
    modelHasTag,
    modelIsFast,
    getModelDisplayName,
    getModelProviderName,
    getModelConfigByApiName,
    isInPeakWindow,
    isWeekendAt,
    isPeakBilling,
    MODEL_PRICING,
    isHybridThinkingModel,
    calculateModelCost,
    getProviderSignatureFields,
    createCatalog,
} from '@hiper2d/ai-agents';
export type {
    ModelTag,
    ReasoningEffort,
    ModelPricing,
    PeakPricing,
    CostCalculationOptions,
    LLMModel,
} from '@hiper2d/ai-agents';

// RANDOM is a picker concept, not a model — the library catalog doesn't know it.
export const LLM_CONSTANTS = {
    ...LIB_LLM_CONSTANTS,
    RANDOM: 'random',
};

/** Library ModelConfig plus werewolf's per-model free-tier policy. */
export interface ModelConfig extends LibModelConfig {
    freeTier?: {
        available: boolean;
        maxBotsPerGame: number; // -1 means unlimited bots, 0 means not available, 1 means only 1 bot (GM or player) can use this model
    };
}

export const AUDIO_MODEL_CONSTANTS = {
    TTS: 'gpt-4o-mini-tts',
    STT: 'whisper-1',
} as const;

// Image pipeline models (platform-side, like the audio models above — never
// user-selected). AVATARS draws the avatar grids, scene pairs and mid-game
// illustrations; VERIFIER is the cheap vision model that inspects the sliced
// avatars (no rendered text, expected gender per slot); ILLUSTRATION_BRIEF turns the GM's night narration into
// a concrete scene description for the image model. See
// app/utils/avatar-generation.ts and app/utils/illustration-generation.ts.
export const IMAGE_MODEL_CONSTANTS = {
    AVATARS: 'gemini-3.1-flash-image',
    VERIFIER: 'gemini-3.5-flash-lite',
    ILLUSTRATION_BRIEF: 'gemini-3.5-flash-lite',
} as const;

/**
 * Story generation emits a whole game setup in one response — a character object per bot
 * (name, story, play style, voice, gender) for up to a dozen bots — so it needs far more
 * room than a turn. It bills directly rather than through `recordGameMasterTokenUsage`, so
 * it produces no `requestStats` rows and is absent from the measurements above; this keeps
 * the 16k it has always run with rather than guessing a smaller number from no data.
 */
export const STORY_MAX_OUTPUT_TOKENS = 16384;

/**
 * Applies the story-generation profile to a freshly created GM agent (used by the story path
 * and mirrored by the live story test). Only the output ceiling differs from a turn: reasoning
 * stays at each model's catalog default (DeepSeek `low`, Qwen budget 1024, …). A deeper
 * story profile (effort `high` + budget 8192) was measured 2026-08-30 and rejected — it
 * roughly doubled setup time on every model and made DeepSeek Flash volatile (60s to a
 * 240s timeout) with no observed quality gain. The per-instance `reasoningEffort` /
 * `thinkingBudgetTokens` fields on AbstractAgent remain available if that ever changes.
 */
export function configureStoryAgent(agent: AbstractAgent): void {
    agent.maxOutputTokens = STORY_MAX_OUTPUT_TOKENS;
}

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

// Prices per 1M tokens, from ai.google.dev/gemini-api/docs/pricing (2026-08).
// Image output bills ~1120 tokens per image regardless of resolution, so one
// image ≈ $0.067 — fewer calls, not lower resolution, is what minimizes cost.
export const IMAGE_MODEL_PRICING = {
    [IMAGE_MODEL_CONSTANTS.AVATARS]: {
        imageOutputPricePerM: 60,
        textInputPricePerM: 0.5,
    },
    [IMAGE_MODEL_CONSTANTS.ILLUSTRATION_BRIEF]: {
        inputPricePerM: 0.30,
        outputPricePerM: 2.50,
    },
} as const;

/**
 * Werewolf's model catalog: the library defaults, copied so the app can annotate entries
 * with free-tier policy without mutating the library's objects.
 */
export const SupportedAiModels: Record<string, ModelConfig> = Object.fromEntries(
    Object.entries(DEFAULT_MODEL_CATALOG).map(([id, config]) => [id, { ...config }])
);

/**
 * Free-tier availability and the per-game bot cap are DERIVED FROM PRICE — not hand-tuned per
 * model — so the two stay consistent. The metric is a model's output price ($/1M tokens), which
 * dominates generation cost. Bands:
 *   <= $2  → unlimited bots
 *   <= $6  → up to 3 bots
 *   <= $15 → 1 bot
 *   > $15  → not available on the free tier
 *
 * Hybrid models — models whose API can run without thinking but that ship as thinking-only
 * entries (see the library's isHybridThinkingModel) — burn extra reasoning tokens at the same
 * per-token price, so their effective output price is multiplied by FREE_TIER_THINKING_COST_FACTOR
 * before banding, exactly as their "(Thinking)" variants always were. Always-on reasoning models
 * (GPT-5, Gemini 3, Magistral) are priced as listed.
 */
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
    const isOptionalThinkingVariant = hasThinking && isHybridThinkingModel(modelApiName);
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

// Explicit policy opt-outs from price banding, for models whose sticker price misrepresents
// real cost. Kimi K3: banding on the $15 sticker output price would land it exactly on the
// SINGLE_MAX boundary (1 bot), but K3 always reasons at max effort and ~85-90% of its output
// tokens are reasoning tokens billed at the output rate. It dodges the usual
// FREE_TIER_THINKING_COST_FACTOR only because it isn't a hybrid entry; with that factor it
// would be $37.50 effective, far past the free-tier ceiling.
SupportedAiModels[LLM_CONSTANTS.KIMI].freeTier = { available: false, maxBotsPerGame: 0 };

// Populate each model's freeTier field from price — the single source of truth for free-tier caps.
// A model with an explicit `freeTier` set above opts out of price banding and keeps that policy.
for (const config of Object.values(SupportedAiModels)) {
    config.freeTier = config.freeTier ?? getFreeTierPolicy(config.modelApiName, config.hasThinking);
}

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
    'gpt-5.4': LLM_CONSTANTS.GPT,
    'deepseek-chat': LLM_CONSTANTS.DEEPSEEK_FLASH,
    'deepseek-reasoner': LLM_CONSTANTS.DEEPSEEK_FLASH,
    'grok-fast': LLM_CONSTANTS.GROK,
    'grok-thinking': LLM_CONSTANTS.GROK,
    // Kimi collapsed to a single always-reasoning K3 entry.
    'kimi-thinking': LLM_CONSTANTS.KIMI,
    // Catalog went thinking-only 2026-08-05: the non-thinking variants were retired and the
    // thinking entries took over the plain ids. A persisted plain id ('claude-opus', 'glm', …)
    // is therefore still live — it now just always runs with reasoning enabled — while the old
    // '-thinking' ids resolve back to those plain ids here.
    'claude-opus-thinking': LLM_CONSTANTS.CLAUDE_OPUS,
    'claude-sonnet-thinking': LLM_CONSTANTS.CLAUDE_SONNET,
    'claude-haiku-thinking': LLM_CONSTANTS.CLAUDE_HAIKU,
    'deepseek-flash-thinking': LLM_CONSTANTS.DEEPSEEK_FLASH,
    'deepseek-pro-thinking': LLM_CONSTANTS.DEEPSEEK_PRO,
    'glm-thinking': LLM_CONSTANTS.GLM,
    // Base `fugu` retired 2026-08-04: it billed at ultra's rates anyway (see the Fugu comment in
    // the library's MODEL_PRICING), so persisted bots resolve to the model they were effectively
    // already paying for. NOTE fugu-ultra is not free-tier eligible ($30 output), so a free-tier
    // game still holding a migrated bot plays fine (agent creation resolves the id) but its model
    // picker and "Retry with different model" will reject until that bot is switched —
    // validateModelUsageForTier re-checks every bot in the game, not just the one being changed.
    'fugu': LLM_CONSTANTS.FUGU_ULTRA,
    // Qwen3.7 Plus retired 2026-08-30 alongside the 3.7→3.8 Flash swap; the Flash entry is the
    // cheap Qwen tier that replaces it.
    'qwen-plus': LLM_CONSTANTS.QWEN_FLASH,
};

/** Maps a possibly-retired model ID to its current equivalent; unknown IDs pass through. */
export function resolveModelId(modelId: string): string {
    return DEPRECATED_MODEL_MAP[modelId] ?? modelId;
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
