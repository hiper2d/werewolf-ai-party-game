import {
    API_KEY_CONSTANTS,
    LLM_CONSTANTS,
    SupportedAiModels,
    resolveModelId,
} from './ai-models';
import { USER_TIERS } from '@/app/api/game-models';
import {
    assertModelAllowedForApiTier,
    consumeModelUsage,
    getAvailableModelsForUser,
    getCandidateModelsForTier,
    getModelPickerOptions,
    getProvidedApiKeyNames,
    getSelectableModelsForUser,
    validateModelUsageForTier,
    type ModelPickerOption,
} from './model-limit-utils';

const modelsByApiKey = (apiKeyName: string): string[] =>
    Object.entries(SupportedAiModels)
        .filter(([, cfg]) => cfg.apiKeyName === apiKeyName)
        .map(([id]) => id);

const anOpenAiModel = modelsByApiKey(API_KEY_CONSTANTS.OPENAI)[0];
const anAnthropicModel = modelsByApiKey(API_KEY_CONSTANTS.ANTHROPIC)[0];
const aGoogleModel = modelsByApiKey(API_KEY_CONSTANTS.GOOGLE)[0];
const aGrokModel = modelsByApiKey(API_KEY_CONSTANTS.GROK)[0];

describe('getProvidedApiKeyNames', () => {
    it('returns empty set for undefined / null', () => {
        expect(getProvidedApiKeyNames(undefined).size).toBe(0);
        expect(getProvidedApiKeyNames(null).size).toBe(0);
    });

    it('treats empty / whitespace-only values as not provided', () => {
        const provided = getProvidedApiKeyNames({
            [API_KEY_CONSTANTS.OPENAI]: '',
            [API_KEY_CONSTANTS.ANTHROPIC]: '   ',
            [API_KEY_CONSTANTS.GOOGLE]: 'sk-real-key',
        });
        expect(provided.has(API_KEY_CONSTANTS.OPENAI)).toBe(false);
        expect(provided.has(API_KEY_CONSTANTS.ANTHROPIC)).toBe(false);
        expect(provided.has(API_KEY_CONSTANTS.GOOGLE)).toBe(true);
    });

    it('returns all non-empty keys', () => {
        const provided = getProvidedApiKeyNames({
            [API_KEY_CONSTANTS.OPENAI]: 'sk-1',
            [API_KEY_CONSTANTS.ANTHROPIC]: 'sk-2',
        });
        expect(provided.size).toBe(2);
    });
});

describe('getAvailableModelsForUser', () => {
    it('FREE tier returns the free-tier candidate set regardless of apiKeys', () => {
        const free = getAvailableModelsForUser(USER_TIERS.FREE);
        expect(free).toEqual(getCandidateModelsForTier(USER_TIERS.FREE));
        const freeWithKeys = getAvailableModelsForUser(USER_TIERS.FREE, {
            [API_KEY_CONSTANTS.OPENAI]: 'sk-1',
        });
        expect(freeWithKeys).toEqual(getCandidateModelsForTier(USER_TIERS.FREE));
    });

    it('PAID tier returns every model regardless of apiKeys', () => {
        const paid = getAvailableModelsForUser(USER_TIERS.PAID, {});
        expect(paid).toEqual(Object.keys(SupportedAiModels));
    });

    it('API tier with no keys returns no models', () => {
        expect(getAvailableModelsForUser(USER_TIERS.API)).toEqual([]);
        expect(getAvailableModelsForUser(USER_TIERS.API, {})).toEqual([]);
        expect(getAvailableModelsForUser(USER_TIERS.API, { [API_KEY_CONSTANTS.OPENAI]: '' })).toEqual([]);
    });

    it('API tier with one key returns only that vendor’s models', () => {
        const result = getAvailableModelsForUser(USER_TIERS.API, {
            [API_KEY_CONSTANTS.OPENAI]: 'sk-real',
        });
        expect(result.length).toBeGreaterThan(0);
        for (const id of result) {
            expect(SupportedAiModels[id].apiKeyName).toBe(API_KEY_CONSTANTS.OPENAI);
        }
        // Spot-check: includes at least one OpenAI model, no Anthropic
        expect(result).toContain(anOpenAiModel);
        expect(result).not.toContain(anAnthropicModel);
    });

    it('API tier with two keys unions the matching vendors', () => {
        const result = getAvailableModelsForUser(USER_TIERS.API, {
            [API_KEY_CONSTANTS.OPENAI]: 'sk-real',
            [API_KEY_CONSTANTS.ANTHROPIC]: 'sk-real-2',
        });
        const allowed = new Set<string>([API_KEY_CONSTANTS.OPENAI, API_KEY_CONSTANTS.ANTHROPIC]);
        expect(result).toContain(anOpenAiModel);
        expect(result).toContain(anAnthropicModel);
        expect(result).not.toContain(aGoogleModel);
        for (const id of result) {
            expect(allowed.has(SupportedAiModels[id].apiKeyName)).toBe(true);
        }
    });

    it('API tier ignores keys with empty values', () => {
        const result = getAvailableModelsForUser(USER_TIERS.API, {
            [API_KEY_CONSTANTS.OPENAI]: 'sk-real',
            [API_KEY_CONSTANTS.GROK]: '',
        });
        expect(result).toContain(anOpenAiModel);
        expect(result).not.toContain(aGrokModel);
    });
});

describe('assertModelAllowedForApiTier', () => {
    it('is a no-op for FREE / PAID tiers', () => {
        expect(() =>
            assertModelAllowedForApiTier(anAnthropicModel, USER_TIERS.FREE, {}, 'as the game master')
        ).not.toThrow();
        expect(() =>
            assertModelAllowedForApiTier(anAnthropicModel, USER_TIERS.PAID, undefined, 'for bots')
        ).not.toThrow();
    });

    it('passes when the required key is provided', () => {
        expect(() =>
            assertModelAllowedForApiTier(
                anOpenAiModel,
                USER_TIERS.API,
                { [API_KEY_CONSTANTS.OPENAI]: 'sk-real' },
                'as the game master'
            )
        ).not.toThrow();
    });

    it('throws when the required key is missing', () => {
        expect(() =>
            assertModelAllowedForApiTier(
                anOpenAiModel,
                USER_TIERS.API,
                { [API_KEY_CONSTANTS.ANTHROPIC]: 'sk-real' },
                'for bots'
            )
        ).toThrow(/OPENAI_API_KEY/);
    });

    it('throws when the required key is empty', () => {
        expect(() =>
            assertModelAllowedForApiTier(
                anOpenAiModel,
                USER_TIERS.API,
                { [API_KEY_CONSTANTS.OPENAI]: '' },
                'for bots'
            )
        ).toThrow();
    });

    it('rejects unresolved RANDOM placeholder explicitly', () => {
        expect(() =>
            assertModelAllowedForApiTier(LLM_CONSTANTS.RANDOM, USER_TIERS.API, {}, 'as the game master')
        ).toThrow(/Random AI model/);
    });
});

describe('validateModelUsageForTier - API tier integration', () => {
    it('passes when GM and all bots have provided keys', () => {
        const apiKeys = {
            [API_KEY_CONSTANTS.OPENAI]: 'sk-1',
            [API_KEY_CONSTANTS.ANTHROPIC]: 'sk-2',
        };
        expect(() =>
            validateModelUsageForTier(USER_TIERS.API, anOpenAiModel, [anAnthropicModel, anOpenAiModel], apiKeys)
        ).not.toThrow();
    });

    it('throws when the GM model needs a missing key', () => {
        const apiKeys = { [API_KEY_CONSTANTS.OPENAI]: 'sk-1' };
        expect(() =>
            validateModelUsageForTier(USER_TIERS.API, anAnthropicModel, [anOpenAiModel], apiKeys)
        ).toThrow(/ANTHROPIC_API_KEY/);
    });

    it('throws when any bot model needs a missing key', () => {
        const apiKeys = { [API_KEY_CONSTANTS.OPENAI]: 'sk-1' };
        expect(() =>
            validateModelUsageForTier(USER_TIERS.API, anOpenAiModel, [anOpenAiModel, aGoogleModel], apiKeys)
        ).toThrow(/GOOGLE_API_KEY/);
    });

    it('throws even when API-tier keys arg is omitted', () => {
        expect(() =>
            validateModelUsageForTier(USER_TIERS.API, anOpenAiModel, [])
        ).toThrow();
    });

    it('does not enforce key gating on FREE tier (unrelated free-tier rules still apply)', () => {
        // Pick a free-tier model with unlimited per-game capacity so reusing it for GM + bot is OK.
        const unlimitedFreeModel = Object.entries(SupportedAiModels).find(
            ([, cfg]) => cfg.freeTier?.available && cfg.freeTier.maxBotsPerGame === -1
        );
        expect(unlimitedFreeModel).toBeDefined();
        const [freeModelId] = unlimitedFreeModel!;
        expect(() =>
            validateModelUsageForTier(USER_TIERS.FREE, freeModelId, [freeModelId])
        ).not.toThrow();
    });
});

describe('getSelectableModelsForUser (model picker contract: GM dropdown, bot lists)', () => {
    it('FREE tier lists only free-tier-available models — premium models like Claude Opus are hidden', () => {
        const models = getSelectableModelsForUser(USER_TIERS.FREE, new Set());
        expect(models).not.toContain(LLM_CONSTANTS.CLAUDE_4_OPUS);
        expect(models).not.toContain(LLM_CONSTANTS.CLAUDE_4_OPUS_THINKING);
        expect(models).toContain(LLM_CONSTANTS.CLAUDE_4_SONNET);
        // exactly the models whose config allows free-tier use
        for (const model of models) {
            const cfg = SupportedAiModels[model];
            expect(cfg.freeTier?.available).toBe(true);
            expect(cfg.freeTier?.maxBotsPerGame).not.toBe(0);
        }
    });

    it('API tier lists only models for vendors whose keys were uploaded', () => {
        const models = getSelectableModelsForUser(
            USER_TIERS.API,
            new Set([API_KEY_CONSTANTS.ANTHROPIC])
        );
        expect(models.length).toBeGreaterThan(0);
        for (const model of models) {
            expect(SupportedAiModels[model].apiKeyName).toBe(API_KEY_CONSTANTS.ANTHROPIC);
        }
        // premium models ARE selectable on API tier when the key is there
        expect(models).toContain(LLM_CONSTANTS.CLAUDE_4_OPUS);
    });

    it('API tier with no uploaded keys lists nothing', () => {
        expect(getSelectableModelsForUser(USER_TIERS.API, new Set())).toEqual([]);
    });

    it('PAID tier lists the full catalog', () => {
        const models = getSelectableModelsForUser(USER_TIERS.PAID, new Set());
        expect(models.sort()).toEqual(Object.keys(SupportedAiModels).sort());
    });

    it('never lists the RANDOM placeholder on any tier', () => {
        for (const tier of [USER_TIERS.FREE, USER_TIERS.PAID, USER_TIERS.API] as const) {
            const models = getSelectableModelsForUser(tier, new Set(Object.values(API_KEY_CONSTANTS)));
            expect(models).not.toContain(LLM_CONSTANTS.RANDOM);
        }
    });

    it('matches getAvailableModelsForUser given the equivalent key map', () => {
        const keyMap = { [API_KEY_CONSTANTS.OPENAI]: 'sk-x', [API_KEY_CONSTANTS.GOOGLE]: 'g-x' };
        expect(
            getSelectableModelsForUser(USER_TIERS.API, new Set([API_KEY_CONSTANTS.OPENAI, API_KEY_CONSTANTS.GOOGLE]))
        ).toEqual(getAvailableModelsForUser(USER_TIERS.API, keyMap));
    });
});

describe('getModelPickerOptions (single source of truth for every picker)', () => {
    const byModel = (opts: ModelPickerOption[]) =>
        new Map(opts.map(o => [o.model, o]));

    // Pin concrete models with distinct free-tier policies, and self-validate the
    // pricing-derived policy so this test fails loudly (rather than silently drifting)
    // if a band ever changes.
    const UNLIMITED = LLM_CONSTANTS.DEEPSEEK_V4_FLASH;   // <= $2 output → unlimited
    const LIMITED_3 = LLM_CONSTANTS.CLAUDE_4_HAIKU;      // <= $5 output → 3 bots
    const SINGLE_1 = LLM_CONSTANTS.CLAUDE_4_SONNET;      // <= $15 output → 1 bot
    const UNAVAILABLE = LLM_CONSTANTS.CLAUDE_4_OPUS;     // > $15 output → not available

    it('pins the assumed free-tier policies (guards against pricing drift)', () => {
        expect(SupportedAiModels[UNLIMITED].freeTier).toMatchObject({ available: true, maxBotsPerGame: -1 });
        expect(SupportedAiModels[LIMITED_3].freeTier).toMatchObject({ available: true, maxBotsPerGame: 3 });
        expect(SupportedAiModels[SINGLE_1].freeTier).toMatchObject({ available: true, maxBotsPerGame: 1 });
        expect(SupportedAiModels[UNAVAILABLE].freeTier).toMatchObject({ available: false, maxBotsPerGame: 0 });
        // A thinking variant is a separate model id with its own free-tier limit.
        expect(SupportedAiModels[LLM_CONSTANTS.CLAUDE_4_HAIKU_THINKING].freeTier?.maxBotsPerGame).toBe(1);
    });

    it('never returns the RANDOM pseudo-model on any tier', () => {
        for (const tier of [USER_TIERS.FREE, USER_TIERS.PAID, USER_TIERS.API] as const) {
            const opts = getModelPickerOptions(tier, new Set(Object.values(API_KEY_CONSTANTS)), {
                showUnavailableDisabled: true,
            });
            expect(opts.find(o => o.model === LLM_CONSTANTS.RANDOM)).toBeUndefined();
        }
        // RANDOM as currentModel is ignored, not added as an escape hatch.
        const opts = getModelPickerOptions(USER_TIERS.FREE, new Set(), { currentModel: LLM_CONSTANTS.RANDOM });
        expect(opts.find(o => o.model === LLM_CONSTANTS.RANDOM)).toBeUndefined();
    });

    describe('FREE tier — static capacity mode (no usageCounts)', () => {
        it('with showUnavailableDisabled: lists ALL models, premium present but disabled', () => {
            const opts = getModelPickerOptions(USER_TIERS.FREE, new Set(), { showUnavailableDisabled: true });
            const m = byModel(opts);
            // Every catalog model is present.
            for (const id of Object.keys(SupportedAiModels)) {
                expect(m.has(id)).toBe(true);
            }
            expect(m.get(UNAVAILABLE)).toEqual({ model: UNAVAILABLE, disabled: true, suffix: '(not available)' });
            expect(m.get(UNLIMITED)).toEqual({ model: UNLIMITED, disabled: false, suffix: '(unlimited)' });
            expect(m.get(LIMITED_3)).toEqual({ model: LIMITED_3, disabled: false, suffix: '(3x per game)' });
            expect(m.get(SINGLE_1)).toEqual({ model: SINGLE_1, disabled: false, suffix: '(1x per game)' });
        });

        it('without showUnavailableDisabled: premium/unavailable models are hidden', () => {
            const opts = getModelPickerOptions(USER_TIERS.FREE, new Set());
            const m = byModel(opts);
            expect(m.has(UNAVAILABLE)).toBe(false);
            expect(m.has(LLM_CONSTANTS.GPT_5_6_SOL)).toBe(false);
            expect(m.has(UNLIMITED)).toBe(true);
            expect(m.has(LIMITED_3)).toBe(true);
        });
    });

    describe('FREE tier — usage mode ((N left) math)', () => {
        it('shows remaining capacity and disables at 0', () => {
            const opts = getModelPickerOptions(USER_TIERS.FREE, new Set(), {
                usageCounts: { [LIMITED_3]: 1, [SINGLE_1]: 1 },
            });
            const m = byModel(opts);
            expect(m.get(LIMITED_3)).toEqual({ model: LIMITED_3, disabled: false, suffix: '(2 left)' });
            // limit 1, used 1, not current → 0 remaining → disabled
            expect(m.get(SINGLE_1)).toEqual({ model: SINGLE_1, disabled: true, suffix: '(0 left)' });
        });

        it('does not count the currently-selected model against itself', () => {
            // LIMITED_3 used once but it IS the current selection → counts as 0 used → (3 left)
            const limited = getModelPickerOptions(USER_TIERS.FREE, new Set(), {
                usageCounts: { [LIMITED_3]: 1 },
                currentModel: LIMITED_3,
            });
            expect(byModel(limited).get(LIMITED_3)).toEqual({ model: LIMITED_3, disabled: false, suffix: '(3 left)' });

            // The single-use model stays selectable while it is the current selection.
            const single = getModelPickerOptions(USER_TIERS.FREE, new Set(), {
                usageCounts: { [SINGLE_1]: 1 },
                currentModel: SINGLE_1,
            });
            expect(byModel(single).get(SINGLE_1)).toEqual({ model: SINGLE_1, disabled: false, suffix: '(1 left)' });
        });

        it('unlimited models are never disabled regardless of usage', () => {
            const opts = getModelPickerOptions(USER_TIERS.FREE, new Set(), {
                usageCounts: { [UNLIMITED]: 99 },
            });
            expect(byModel(opts).get(UNLIMITED)).toEqual({ model: UNLIMITED, disabled: false, suffix: '(unlimited)' });
        });
    });

    describe('currentModel escape hatch', () => {
        it('FREE: a now-disallowed current model is present but disabled', () => {
            const opts = getModelPickerOptions(USER_TIERS.FREE, new Set(), {
                usageCounts: {},
                currentModel: UNAVAILABLE,
            });
            const entry = byModel(opts).get(UNAVAILABLE);
            expect(entry).toBeDefined();
            expect(entry!.disabled).toBe(true);
        });

        it('API: a current model whose key is missing is present and selectable', () => {
            // Only Anthropic key uploaded, but the current model is an OpenAI one.
            const opts = getModelPickerOptions(USER_TIERS.API, new Set([API_KEY_CONSTANTS.ANTHROPIC]), {
                currentModel: anOpenAiModel,
            });
            const entry = byModel(opts).get(anOpenAiModel);
            expect(entry).toEqual({ model: anOpenAiModel, disabled: false });
        });

        it('includes an unknown/legacy current model id as an enabled entry', () => {
            const opts = getModelPickerOptions(USER_TIERS.FREE, new Set(), {
                usageCounts: {},
                currentModel: 'legacy-model-no-longer-in-catalog',
            });
            expect(byModel(opts).get('legacy-model-no-longer-in-catalog'))
                .toEqual({ model: 'legacy-model-no-longer-in-catalog', disabled: false });
        });
    });

    describe('API / PAID tiers', () => {
        it('API tier lists only uploaded-key vendors, in both showUnavailableDisabled modes', () => {
            for (const showUnavailableDisabled of [false, true]) {
                const opts = getModelPickerOptions(USER_TIERS.API, new Set([API_KEY_CONSTANTS.ANTHROPIC]), {
                    showUnavailableDisabled,
                });
                expect(opts.length).toBeGreaterThan(0);
                for (const o of opts) {
                    expect(SupportedAiModels[o.model].apiKeyName).toBe(API_KEY_CONSTANTS.ANTHROPIC);
                    expect(o.disabled).toBe(false);
                    expect(o.suffix).toBeUndefined();
                }
                // Premium models ARE selectable on API tier when the key is present.
                expect(byModel(opts).has(LLM_CONSTANTS.CLAUDE_4_OPUS)).toBe(true);
            }
        });

        it('API tier with no keys lists nothing', () => {
            expect(getModelPickerOptions(USER_TIERS.API, new Set())).toEqual([]);
        });

        it('PAID tier lists the full catalog, all enabled, no suffixes', () => {
            const opts = getModelPickerOptions(USER_TIERS.PAID, new Set());
            expect(opts.map(o => o.model).sort()).toEqual(Object.keys(SupportedAiModels).sort());
            for (const o of opts) {
                expect(o.disabled).toBe(false);
                expect(o.suffix).toBeUndefined();
            }
        });
    });
});

// Games persist a model ID per bot and per GM, so retired IDs survive in old docs until the
// Firestore migration runs. Tier validation re-checks EVERY bot in a game, so a single stale ID
// used to throw "Unsupported AI model" and make the model picker unusable for that whole game —
// including the attempt to switch the stale bot onto a current model.
describe('deprecated model IDs in persisted games', () => {
    const LEGACY_TO_CURRENT: Array<[string, string]> = [
        ['kimi-thinking', LLM_CONSTANTS.KIMI],
        ['grok-thinking', LLM_CONSTANTS.GROK_4_5],
        ['grok-fast', LLM_CONSTANTS.GROK_4_5],
        ['gpt-5.4', LLM_CONSTANTS.GPT_5_6_TERRA],
        ['deepseek-chat', LLM_CONSTANTS.DEEPSEEK_V4_FLASH],
        ['deepseek-reasoner', LLM_CONSTANTS.DEEPSEEK_V4_FLASH_THINKING],
    ];

    it.each(LEGACY_TO_CURRENT)('resolves %s to a supported model', (legacy, current) => {
        expect(resolveModelId(legacy)).toBe(current);
        expect(SupportedAiModels[resolveModelId(legacy)]).toBeDefined();
    });

    it('passes unknown IDs through untouched', () => {
        expect(resolveModelId('totally-made-up')).toBe('totally-made-up');
    });

    it.each(LEGACY_TO_CURRENT)('does not throw on a paid-tier game holding %s', (legacy) => {
        expect(() =>
            validateModelUsageForTier(USER_TIERS.PAID, LLM_CONSTANTS.GPT_5_6_LUNA, [legacy], {})
        ).not.toThrow();
    });

    it('lets a paid-tier user switch models in a game whose OTHER bot is still on a legacy ID', () => {
        expect(() =>
            validateModelUsageForTier(
                USER_TIERS.PAID,
                LLM_CONSTANTS.GPT_5_6_LUNA,
                [LLM_CONSTANTS.GPT_5_6_LUNA, 'kimi-thinking'],
                {}
            )
        ).not.toThrow();
    });

    it('counts a legacy ID against its replacement free-tier budget, not a separate bucket', () => {
        // deepseek-flash is unlimited on the free tier, so use a capped model: the legacy
        // grok IDs both resolve to grok (3 bots/game).
        const usage: Record<string, number> = {};
        consumeModelUsage('grok-fast', USER_TIERS.FREE, usage, 'for bots');
        consumeModelUsage('grok-thinking', USER_TIERS.FREE, usage, 'for bots');
        consumeModelUsage(LLM_CONSTANTS.GROK_4_5, USER_TIERS.FREE, usage, 'for bots');

        expect(usage[LLM_CONSTANTS.GROK_4_5]).toBe(3);
        // A 4th would exceed grok's 3-bot free-tier cap.
        expect(() => consumeModelUsage('grok-fast', USER_TIERS.FREE, usage, 'for bots')).toThrow(
            /can only be used 3 times per game/
        );
    });

    it('still rejects a genuinely unsupported model', () => {
        expect(() =>
            validateModelUsageForTier(USER_TIERS.PAID, LLM_CONSTANTS.GPT_5_6_LUNA, ['not-a-model'], {})
        ).toThrow(/Unsupported AI model/);
    });
});

// Kimi K3 always reasons at max effort with ~85-90% of output tokens spent on reasoning, so it
// opts out of price-derived banding rather than riding the $15 SINGLE_MAX boundary.
describe('Kimi K3 free-tier policy', () => {
    it('is not available on the free tier', () => {
        expect(SupportedAiModels[LLM_CONSTANTS.KIMI].freeTier).toEqual({
            available: false,
            maxBotsPerGame: 0,
        });
        expect(getCandidateModelsForTier(USER_TIERS.FREE)).not.toContain(LLM_CONSTANTS.KIMI);
    });

    it('throws for a free-tier game trying to use it', () => {
        expect(() =>
            validateModelUsageForTier(USER_TIERS.FREE, LLM_CONSTANTS.KIMI, [], {})
        ).toThrow(/not available on the free tier/);
    });

    it('remains selectable on paid tier', () => {
        expect(getCandidateModelsForTier(USER_TIERS.PAID)).toContain(LLM_CONSTANTS.KIMI);
    });
});
