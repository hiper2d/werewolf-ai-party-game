import {LLM_CONSTANTS, SupportedAiModels} from '@/app/ai/ai-models';
import {ApiKeyMap, UserTier, USER_TIERS} from '@/app/api/game-models';

export const FREE_TIER_UNLIMITED = Number.POSITIVE_INFINITY;

export function getPerGameModelLimit(modelName: string, tier: UserTier): number {
    if (tier !== USER_TIERS.FREE) {
        return FREE_TIER_UNLIMITED;
    }

    if (modelName === LLM_CONSTANTS.RANDOM) {
        throw new Error('Random AI model selections must be resolved before generating or saving a game.');
    }

    const config = SupportedAiModels[modelName];
    if (!config) {
        throw new Error(`Unsupported AI model: ${modelName}.`);
    }

    if (!config.freeTier?.available || config.freeTier.maxBotsPerGame === 0) {
        return 0;
    }

    return config.freeTier.maxBotsPerGame === -1
        ? FREE_TIER_UNLIMITED
        : config.freeTier.maxBotsPerGame;
}

export function hasCapacity(modelName: string, tier: UserTier, usageCounts: Record<string, number>): boolean {
    if (tier !== USER_TIERS.FREE) {
        return true;
    }

    if (modelName === LLM_CONSTANTS.RANDOM) {
        return false;
    }

    const limit = getPerGameModelLimit(modelName, tier);
    if (limit === 0) {
        return false;
    }

    if (limit === FREE_TIER_UNLIMITED) {
        return true;
    }

    const used = usageCounts[modelName] ?? 0;
    return used < limit;
}

export function consumeModelUsage(
    modelName: string,
    tier: UserTier,
    usageCounts: Record<string, number>,
    context: string
): void {
    if (tier !== USER_TIERS.FREE) {
        return;
    }

    if (modelName === LLM_CONSTANTS.RANDOM) {
        throw new Error('Random AI model selections must be resolved before generating or saving a game.');
    }

    const limit = getPerGameModelLimit(modelName, tier);
    if (limit === 0) {
        throw new Error(`The AI model ${modelName} is not available on the free tier ${context}.`);
    }

    const used = usageCounts[modelName] ?? 0;
    if (limit !== FREE_TIER_UNLIMITED && used >= limit) {
        const limitText = limit === 1 ? 'once' : `${limit} times`;
        throw new Error(`The AI model ${modelName} can only be used ${limitText} per game on the free tier.`);
    }

    usageCounts[modelName] = used + 1;
}

export function getCandidateModelsForTier(tier: UserTier): string[] {
    if (tier !== USER_TIERS.FREE) {
        return Object.keys(SupportedAiModels);
    }

    return Object.entries(SupportedAiModels)
        .filter(([, config]) => config.freeTier?.available && config.freeTier.maxBotsPerGame !== 0)
        .map(([modelName]) => modelName);
}

/**
 * Returns the set of apiKeyName values for which the user has provided a non-empty key.
 * Empty/whitespace-only values are treated as "not provided".
 */
export function getProvidedApiKeyNames(apiKeys: ApiKeyMap | undefined | null): Set<string> {
    if (!apiKeys) return new Set();
    const provided = new Set<string>();
    for (const [name, value] of Object.entries(apiKeys)) {
        if (typeof value === 'string' && value.trim() !== '') {
            provided.add(name);
        }
    }
    return provided;
}

/**
 * Returns the models a user is allowed to select given their tier and (for API tier) the
 * set of API key names they have actually provided.
 *
 * - FREE / PAID tiers: keyed off platform-managed credentials, so the apiKeys arg is ignored.
 * - API tier: only models whose `apiKeyName` is present (with a non-empty value) in the user's keys.
 */
export function getAvailableModelsForUser(tier: UserTier, apiKeys?: ApiKeyMap | null): string[] {
    return getSelectableModelsForUser(tier, getProvidedApiKeyNames(apiKeys));
}

/**
 * Same as getAvailableModelsForUser but takes the already-extracted set of provided
 * key names — the shape client components hold (they never see key values).
 * This is the single source of truth for which models a user may select in any
 * model picker (GM dropdown, bot list, preview dialogs).
 */
export function getSelectableModelsForUser(tier: UserTier, providedKeyNames: Set<string>): string[] {
    const candidates = getCandidateModelsForTier(tier);
    if (tier !== USER_TIERS.API) {
        return candidates;
    }
    return candidates.filter(modelId => {
        const config = SupportedAiModels[modelId];
        return !!config && providedKeyNames.has(config.apiKeyName);
    });
}

/**
 * Throws a descriptive error if the API-tier user has not provided the API key required
 * by `modelName`. No-op for FREE / PAID tiers (those use platform-managed keys).
 */
export function assertModelAllowedForApiTier(
    modelName: string,
    tier: UserTier,
    apiKeys: ApiKeyMap | undefined | null,
    context: string
): void {
    if (tier !== USER_TIERS.API) {
        return;
    }
    if (modelName === LLM_CONSTANTS.RANDOM) {
        // Random selections must be resolved before this point; treat as a programming error.
        throw new Error('Random AI model selections must be resolved before validating API tier access.');
    }
    const config = SupportedAiModels[modelName];
    if (!config) {
        throw new Error(`Unsupported AI model: ${modelName}.`);
    }
    const provided = getProvidedApiKeyNames(apiKeys);
    if (!provided.has(config.apiKeyName)) {
        throw new Error(
            `The AI model ${modelName} requires the ${config.apiKeyName} API key ${context}. Please add it on your Profile page.`
        );
    }
}

export function validateModelUsageForTier(
    tier: UserTier,
    gameMasterModel: string,
    botModels: string[],
    apiKeys?: ApiKeyMap | null
): void {
    if (tier === USER_TIERS.API) {
        assertModelAllowedForApiTier(gameMasterModel, tier, apiKeys, 'as the game master');
        for (const botModel of botModels) {
            assertModelAllowedForApiTier(botModel, tier, apiKeys, 'for bots');
        }
        return;
    }

    if (tier !== USER_TIERS.FREE) {
        // Paid tier runs on platform keys, so any *real* model is allowed — but a
        // RANDOM placeholder or unknown model id must never slip through to a
        // persisted game (it would break agent creation later).
        for (const model of [gameMasterModel, ...botModels]) {
            if (model === LLM_CONSTANTS.RANDOM) {
                throw new Error('Random AI model selections must be resolved before generating or saving a game.');
            }
            if (!SupportedAiModels[model]) {
                throw new Error(`Unsupported AI model: ${model}.`);
            }
        }
        return;
    }

    const usage: Record<string, number> = {};
    consumeModelUsage(gameMasterModel, tier, usage, 'as the game master');
    for (const botModel of botModels) {
        consumeModelUsage(botModel, tier, usage, 'for bots');
    }
}
