import {LLM_CONSTANTS, SupportedAiModels} from '@/app/ai/ai-models';
import {UserTier} from '@/app/api/game-models';

export const FREE_TIER_UNLIMITED = Number.POSITIVE_INFINITY;

export function getPerGameModelLimit(modelName: string, tier: UserTier): number {
    if (tier !== 'free') {
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
    if (tier !== 'free') {
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
    if (tier !== 'free') {
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
    if (tier !== 'free') {
        return Object.keys(SupportedAiModels);
    }

    return Object.entries(SupportedAiModels)
        .filter(([, config]) => config.freeTier?.available && config.freeTier.maxBotsPerGame !== 0)
        .map(([modelName]) => modelName);
}

export function validateModelUsageForTier(tier: UserTier, gameMasterModel: string, botModels: string[]): void {
    if (tier !== 'free') {
        return;
    }

    const usage: Record<string, number> = {};
    consumeModelUsage(gameMasterModel, tier, usage, 'as the game master');
    for (const botModel of botModels) {
        consumeModelUsage(botModel, tier, usage, 'for bots');
    }
}
