/**
 * Werewolf's model configuration: the @hiper2d/ai-agents catalog plus app policy.
 *
 * The library owns the facts and tuning defaults (model API names, thinking dialects,
 * reasoning effort, output ceilings, prices). This module overlays what is werewolf's
 * business, not the library's: free-tier availability bands, the RANDOM picker entry,
 * deprecated-id migration for persisted game docs, and the audio/image pipeline models.
 */

import {IMAGE_MODEL_CONSTANTS as LIB_IMAGE_MODELS, IMAGE_MODEL_PRICING as LIB_IMAGE_PRICING} from "@hiper2d/ai-agents/images";
import {
    LLM_CONSTANTS as LIB_LLM_CONSTANTS,
    ModelConfig as LibModelConfig,
    SupportedAiModels as DEFAULT_MODEL_CATALOG,
    MODEL_PRICING,
    type ModelPricing,
    type AbstractAgent,
} from '@hiper2d/ai-agents';
import measuredTurnCosts from './measured-turn-costs.json';

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

// Voice models (TTS/STT) live in @hiper2d/ai-agents: VOICE_MODEL_CONSTANTS / VOICE_MODEL_PRICING.

// Image pipeline models (platform-side, like the audio models above — never
// user-selected). AVATARS draws the avatar grids, scene pairs and mid-game
// illustrations; ILLUSTRATION_BRIEF turns the GM's night narration into
// a concrete scene description for the image model. See
// app/utils/avatar-generation.ts and app/utils/illustration-generation.ts.
export const IMAGE_MODEL_CONSTANTS = {
    AVATARS: LIB_IMAGE_MODELS.GEMINI_FLASH_IMAGE,
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

// The image model's price is a library fact (see its image-catalog); the brief model is
// a text model priced here because it is not in the LLM catalog.
export const IMAGE_MODEL_PRICING = {
    [IMAGE_MODEL_CONSTANTS.AVATARS]: LIB_IMAGE_PRICING[LIB_IMAGE_MODELS.GEMINI_FLASH_IMAGE],
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
 * Free-tier availability and the per-game bot cap are DERIVED FROM WHAT A TURN COSTS — not
 * hand-tuned per model — so the two stay consistent. The metric is the average cost of one bot
 * turn in US dollars: input context plus the visible reply plus whatever hidden reasoning the
 * model emits, all billed. Bands:
 *   <= 0.3¢ per turn → unlimited bots
 *   <= 1¢            → up to 3 bots
 *   <= 2¢            → 1 bot
 *   > 2¢             → not available on the free tier
 *
 * The cost per turn is MEASURED from `requestStats` (scripts/measure-turn-costs.ts writes
 * `measured-turn-costs.json`). The previous metric, the sticker output price with a flat ×2.5
 * for hybrid thinking models, missed the thing that actually drives cost: how many tokens a
 * model emits per turn. Over 30 days Grok 4.6 ($6 output, banded as "3 bots") averaged 2,200
 * output tokens a turn, 94% of it reasoning, and was the most expensive model in the app at
 * 3.5¢ a turn; GLM-5.3 ($4.40 sticker, ×2.5 → "1 bot") emitted 270 and cost 0.75¢. A model
 * without enough measured turns (MEASURED_TURN_COSTS_MIN_CALLS) is banded on an estimate from
 * its sticker prices instead, see estimateTurnCostUSD.
 */
export const FREE_TIER_TURN_COST_BANDS = {
    UNLIMITED_MAX: 0.003,   // <= $0.003 per turn → unlimited bots
    LIMITED_MAX: 0.01,      // <= $0.01 → up to LIMITED_MAX_BOTS bots
    SINGLE_MAX: 0.02,       // <= $0.02 → 1 bot; above → not available on free tier
} as const;
export const FREE_TIER_LIMITED_MAX_BOTS = 3;

/** One model's measured average over the window, as written by scripts/measure-turn-costs.ts. */
export interface MeasuredTurnCost {
    usdPerTurn: number;
    calls: number;
    inputTokens: number;
    cachedInputTokens: number;
    outputTokens: number;
    /** Hidden reasoning tokens where the provider reports them separately (0 where it folds them into outputTokens). */
    reasoningTokens: number;
}
export interface MeasuredTurnCosts {
    measuredAt: string;
    windowDays: number;
    models: Record<string, MeasuredTurnCost>;
}
export const MEASURED_TURN_COSTS: MeasuredTurnCosts = measuredTurnCosts;
/** Fewer measured turns than this and the sticker-price estimate decides the band instead. */
export const MEASURED_TURN_COSTS_MIN_CALLS = 100;

/**
 * The turn-cost assumptions for a model nobody has played enough yet: a werewolf turn carries
 * about 8k tokens of context (measured 5-12k across models, mostly cache misses) and every
 * catalog model reasons, so budget 1k output tokens for the hidden thinking plus the reply.
 * Deliberately a little pessimistic on output: the estimate only has to hold until the model
 * has MEASURED_TURN_COSTS_MIN_CALLS turns on record.
 */
export const ESTIMATED_TURN_INPUT_TOKENS = 8_000;
export const ESTIMATED_TURN_OUTPUT_TOKENS = 1_000;

export function estimateTurnCostUSD(pricing: Pick<ModelPricing, 'inputPrice' | 'outputPrice'>): number {
    return (ESTIMATED_TURN_INPUT_TOKENS * pricing.inputPrice + ESTIMATED_TURN_OUTPUT_TOKENS * pricing.outputPrice) / 1_000_000;
}

export interface TurnCost {
    usd: number;
    /** `measured` = averaged from real turns in requestStats; `estimated` = from sticker prices. */
    source: 'measured' | 'estimated';
    /** Measured turns behind the number (0 when estimated). */
    calls: number;
}

/** What one turn of this model costs, measured when there is enough data, else estimated. Null without pricing. */
export function getTurnCost(modelId: string): TurnCost | null {
    const config = SupportedAiModels[modelId];
    const pricing = config ? MODEL_PRICING[config.modelApiName] : undefined;
    if (!pricing) {
        return null;
    }
    const measured = MEASURED_TURN_COSTS.models[modelId];
    if (measured && measured.calls >= MEASURED_TURN_COSTS_MIN_CALLS) {
        return { usd: measured.usdPerTurn, source: 'measured', calls: measured.calls };
    }
    return { usd: estimateTurnCostUSD(pricing), source: 'estimated', calls: 0 };
}

/** Maps a cost per turn to the free-tier policy ({ available, maxBotsPerGame }). */
export function bandTurnCost(usdPerTurn: number): { available: boolean; maxBotsPerGame: number } {
    if (usdPerTurn <= FREE_TIER_TURN_COST_BANDS.UNLIMITED_MAX) {
        return { available: true, maxBotsPerGame: -1 };
    }
    if (usdPerTurn <= FREE_TIER_TURN_COST_BANDS.LIMITED_MAX) {
        return { available: true, maxBotsPerGame: FREE_TIER_LIMITED_MAX_BOTS };
    }
    if (usdPerTurn <= FREE_TIER_TURN_COST_BANDS.SINGLE_MAX) {
        return { available: true, maxBotsPerGame: 1 };
    }
    return { available: false, maxBotsPerGame: 0 };
}

/**
 * Derives a model's free-tier policy ({ available, maxBotsPerGame }) from its cost per turn.
 * Returns "not available" (available: false, maxBotsPerGame: 0) when there's no pricing.
 */
export function getFreeTierPolicy(modelId: string): { available: boolean; maxBotsPerGame: number } {
    const turnCost = getTurnCost(modelId);
    if (!turnCost) {
        return { available: false, maxBotsPerGame: 0 };
    }
    return bandTurnCost(turnCost.usd);
}

// Populate each model's freeTier field from its turn cost — the single source of truth for
// free-tier caps. A model with an explicit `freeTier` set before this loop opts out of banding
// and keeps that policy (none do today; Kimi K3's old opt-out is now covered by the estimate,
// which puts its $3/$15 prices at 3.9¢ a turn, well past the free-tier ceiling).
for (const [modelId, config] of Object.entries(SupportedAiModels)) {
    config.freeTier = config.freeTier ?? getFreeTierPolicy(modelId);
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
    // Mistral Large 3 and Magistral Medium 1.2 dropped 2026-09-18 (lib 0.6.0): both retired by
    // Mistral, and Magistral's alias had already become Medium 3.5 server-side. Small 4 is the
    // static fallback because it is the only Mistral entry every tier can hold — Medium 3.5 runs
    // with reasoning now, and its hybrid-banded price puts it outside the free tier.
    // `scripts/migrate-model-ids.ts` does the tier-aware rewrite (paid games → Medium 3.5).
    'mistral-large': LLM_CONSTANTS.MISTRAL_SMALL,
    'mistral-magistral': LLM_CONSTANTS.MISTRAL_SMALL,
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
