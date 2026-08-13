import {LLM_CONSTANTS, SupportedAiModels, resolveModelId} from '@/app/ai/ai-models';
import {UserTier, USER_TIERS} from '@/app/api/game-models';

export const FREE_TIER_UNLIMITED = Number.POSITIVE_INFINITY;

export function getPerGameModelLimit(modelName: string, tier: UserTier): number {
    if (tier !== USER_TIERS.FREE) {
        return FREE_TIER_UNLIMITED;
    }

    if (modelName === LLM_CONSTANTS.RANDOM) {
        throw new Error('Random AI model selections must be resolved before generating or saving a game.');
    }

    const config = SupportedAiModels[resolveModelId(modelName)];
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

    const resolved = resolveModelId(modelName);
    const limit = getPerGameModelLimit(resolved, tier);
    if (limit === 0) {
        return false;
    }

    if (limit === FREE_TIER_UNLIMITED) {
        return true;
    }

    const used = usageCounts[resolved] ?? 0;
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

    const resolved = resolveModelId(modelName);
    const limit = getPerGameModelLimit(resolved, tier);
    if (limit === 0) {
        throw new Error(`The AI model ${resolved} is not available on the free tier ${context}.`);
    }

    const used = usageCounts[resolved] ?? 0;
    if (limit !== FREE_TIER_UNLIMITED && used >= limit) {
        const limitText = limit === 1 ? 'once' : `${limit} times`;
        throw new Error(`The AI model ${resolved} can only be used ${limitText} per game on the free tier.`);
    }

    usageCounts[resolved] = used + 1;
}

export function getCandidateModelsForTier(tier: UserTier): string[] {
    if (tier !== USER_TIERS.FREE) {
        return Object.keys(SupportedAiModels);
    }

    return Object.entries(SupportedAiModels)
        .filter(([, config]) => config.freeTier?.available && config.freeTier.maxBotsPerGame !== 0)
        .map(([modelName]) => modelName);
}

/** Display-ready entry for a model picker. `suffix` is an optional label decoration
 *  (e.g. "(unlimited)", "(3 left)", "(not available)"); pickers that don't show a
 *  suffix simply ignore it. */
export interface ModelPickerOption {
    model: string;
    disabled: boolean;
    suffix?: string;
}

export interface ModelPickerOptionsOpts {
    /**
     * Per-game usage counts (free tier only). When provided, free-tier entries get
     * remaining-capacity suffixes ("(N left)" / "(unlimited)") and are disabled at 0
     * remaining. The currently-selected model does not count against itself
     * (Math.max(0, used - 1)). When omitted, free-tier entries get static capacity
     * suffixes ("(Nx per game)" / "(unlimited)" / "(not available)").
     */
    usageCounts?: Record<string, number>;
    /**
     * The currently-selected model. Always included in the result even if no longer
     * allowed (the "see what you're switching from" escape hatch), marked disabled
     * when it is not actually selectable.
     */
    currentModel?: string;
    /**
     * Free tier only: include premium/unavailable models in the list, disabled and
     * suffixed "(not available)", instead of hiding them. GM-style pickers leave this
     * off (hide unavailable); the bot multi-select turns it on.
     */
    showUnavailableDisabled?: boolean;
}

/**
 * The single tested source of truth for what every model picker shows. Returns
 * display-ready entries; each picker maps the result to its own display shape and
 * never re-implements tier/usage rules. Never returns RANDOM (a UI-only pseudo-model
 * that pickers offering it must add themselves).
 */
export function getModelPickerOptions(
    tier: UserTier,
    opts: ModelPickerOptionsOpts = {}
): ModelPickerOption[] {
    const { usageCounts, currentModel, showUnavailableDisabled } = opts;
    const hasCurrent = !!currentModel
        && currentModel !== ''
        && currentModel !== LLM_CONSTANTS.RANDOM;

    if (tier !== USER_TIERS.FREE) {
        // PAID: no per-game limits. Full catalog + current escape hatch.
        const models = getCandidateModelsForTier(tier);
        const result = models.map(model => ({ model, disabled: false }));
        if (hasCurrent && !models.includes(currentModel!)) {
            result.push({ model: currentModel!, disabled: false });
        }
        return result;
    }

    // FREE tier.
    const options: ModelPickerOption[] = [];
    for (const [model, config] of Object.entries(SupportedAiModels)) {
        const available = !!config.freeTier?.available && config.freeTier.maxBotsPerGame !== 0;
        const isCurrent = model === currentModel;
        if (!(showUnavailableDisabled || available || isCurrent)) {
            continue;
        }

        if (usageCounts) {
            const limit = getPerGameModelLimit(model, USER_TIERS.FREE);
            if (limit === FREE_TIER_UNLIMITED) {
                options.push({ model, disabled: false, suffix: '(unlimited)' });
                continue;
            }
            const used = usageCounts[model] ?? 0;
            const adjustedUsed = isCurrent ? Math.max(0, used - 1) : used;
            const remaining = Math.max(0, limit - adjustedUsed);
            options.push({ model, disabled: remaining === 0, suffix: `(${remaining} left)` });
            continue;
        }

        if (!available) {
            options.push({ model, disabled: true, suffix: '(not available)' });
            continue;
        }
        const limit = config.freeTier!.maxBotsPerGame;
        options.push(limit === -1
            ? { model, disabled: false, suffix: '(unlimited)' }
            : { model, disabled: false, suffix: `(${limit}x per game)` });
    }

    // Current model not in the catalog (legacy/unknown id): include as an enabled
    // escape hatch so the user can still see what they're switching from.
    if (hasCurrent && !SupportedAiModels[currentModel!]) {
        options.push({ model: currentModel!, disabled: false });
    }
    return options;
}

export function validateModelUsageForTier(
    tier: UserTier,
    gameMasterModel: string,
    botModels: string[]
): void {
    if (tier !== USER_TIERS.FREE) {
        // Paid tier runs on platform keys, so any *real* model is allowed — but a
        // RANDOM placeholder or unknown model id must never slip through to a
        // persisted game (it would break agent creation later).
        for (const model of [gameMasterModel, ...botModels]) {
            if (model === LLM_CONSTANTS.RANDOM) {
                throw new Error('Random AI model selections must be resolved before generating or saving a game.');
            }
            if (!SupportedAiModels[resolveModelId(model)]) {
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
