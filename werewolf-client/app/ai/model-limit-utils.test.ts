import {
    API_KEY_CONSTANTS,
    LLM_CONSTANTS,
    SupportedAiModels,
    resolveModelId,
} from './ai-models';
import { USER_TIERS } from '@/app/api/game-models';
import {
    consumeModelUsage,
    getCandidateModelsForTier,
    getModelPickerOptions,
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

describe('validateModelUsageForTier', () => {
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

    it('PAID tier allows any real model without any key set', () => {
        expect(() =>
            validateModelUsageForTier(USER_TIERS.PAID, anOpenAiModel, [anAnthropicModel, aGoogleModel, aGrokModel])
        ).not.toThrow();
    });
});

describe('getModelPickerOptions (single source of truth for every picker)', () => {
    const byModel = (opts: ModelPickerOption[]) =>
        new Map(opts.map(o => [o.model, o]));

    // Pin concrete models with distinct free-tier policies, and self-validate the
    // pricing-derived policy so this test fails loudly (rather than silently drifting)
    // if a band ever changes.
    // Effective output price = sticker × 2.5 for hybrid thinking-only models (Claude, DeepSeek, GLM).
    const UNLIMITED = LLM_CONSTANTS.DEEPSEEK_FLASH;   // $0.66 × 2.5 = $1.65 <= $2 → unlimited
    const LIMITED_3 = LLM_CONSTANTS.DEEPSEEK_PRO;     // $1.98 × 2.5 = $4.95 <= $6 → 3 bots
    const SINGLE_1 = LLM_CONSTANTS.CLAUDE_HAIKU;       // $5 × 2.5 = $12.50 <= $15 → 1 bot
    const UNAVAILABLE = LLM_CONSTANTS.CLAUDE_OPUS;     // $25 × 2.5 > $15 → not available

    it('pins the assumed free-tier policies (guards against pricing drift)', () => {
        expect(SupportedAiModels[UNLIMITED].freeTier).toMatchObject({ available: true, maxBotsPerGame: -1 });
        expect(SupportedAiModels[LIMITED_3].freeTier).toMatchObject({ available: true, maxBotsPerGame: 3 });
        expect(SupportedAiModels[SINGLE_1].freeTier).toMatchObject({ available: true, maxBotsPerGame: 1 });
        expect(SupportedAiModels[UNAVAILABLE].freeTier).toMatchObject({ available: false, maxBotsPerGame: 0 });
        // Hybrid thinking-only models keep paying the reasoning multiplier: GLM-5.3 at $4.4
        // sticker output would be 3 bots, but ×2.5 = $11 effective lands it in the 1-bot band.
        expect(SupportedAiModels[LLM_CONSTANTS.GLM].freeTier?.maxBotsPerGame).toBe(1);
    });

    it('never returns the RANDOM pseudo-model on any tier', () => {
        for (const tier of [USER_TIERS.FREE, USER_TIERS.PAID] as const) {
            const opts = getModelPickerOptions(tier, {
                showUnavailableDisabled: true,
            });
            expect(opts.find(o => o.model === LLM_CONSTANTS.RANDOM)).toBeUndefined();
        }
        // RANDOM as currentModel is ignored, not added as an escape hatch.
        const opts = getModelPickerOptions(USER_TIERS.FREE, { currentModel: LLM_CONSTANTS.RANDOM });
        expect(opts.find(o => o.model === LLM_CONSTANTS.RANDOM)).toBeUndefined();
    });

    describe('FREE tier — static capacity mode (no usageCounts)', () => {
        it('with showUnavailableDisabled: lists ALL models, premium present but disabled', () => {
            const opts = getModelPickerOptions(USER_TIERS.FREE, { showUnavailableDisabled: true });
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
            const opts = getModelPickerOptions(USER_TIERS.FREE);
            const m = byModel(opts);
            expect(m.has(UNAVAILABLE)).toBe(false);
            expect(m.has(LLM_CONSTANTS.GPT_SOL)).toBe(false);
            expect(m.has(UNLIMITED)).toBe(true);
            expect(m.has(LIMITED_3)).toBe(true);
        });
    });

    describe('FREE tier — usage mode ((N left) math)', () => {
        it('shows remaining capacity and disables at 0', () => {
            const opts = getModelPickerOptions(USER_TIERS.FREE, {
                usageCounts: { [LIMITED_3]: 1, [SINGLE_1]: 1 },
            });
            const m = byModel(opts);
            expect(m.get(LIMITED_3)).toEqual({ model: LIMITED_3, disabled: false, suffix: '(2 left)' });
            // limit 1, used 1, not current → 0 remaining → disabled
            expect(m.get(SINGLE_1)).toEqual({ model: SINGLE_1, disabled: true, suffix: '(0 left)' });
        });

        it('does not count the currently-selected model against itself', () => {
            // LIMITED_3 used once but it IS the current selection → counts as 0 used → (3 left)
            const limited = getModelPickerOptions(USER_TIERS.FREE, {
                usageCounts: { [LIMITED_3]: 1 },
                currentModel: LIMITED_3,
            });
            expect(byModel(limited).get(LIMITED_3)).toEqual({ model: LIMITED_3, disabled: false, suffix: '(3 left)' });

            // The single-use model stays selectable while it is the current selection.
            const single = getModelPickerOptions(USER_TIERS.FREE, {
                usageCounts: { [SINGLE_1]: 1 },
                currentModel: SINGLE_1,
            });
            expect(byModel(single).get(SINGLE_1)).toEqual({ model: SINGLE_1, disabled: false, suffix: '(1 left)' });
        });

        it('unlimited models are never disabled regardless of usage', () => {
            const opts = getModelPickerOptions(USER_TIERS.FREE, {
                usageCounts: { [UNLIMITED]: 99 },
            });
            expect(byModel(opts).get(UNLIMITED)).toEqual({ model: UNLIMITED, disabled: false, suffix: '(unlimited)' });
        });
    });

    describe('currentModel escape hatch', () => {
        it('FREE: a now-disallowed current model is present but disabled', () => {
            const opts = getModelPickerOptions(USER_TIERS.FREE, {
                usageCounts: {},
                currentModel: UNAVAILABLE,
            });
            const entry = byModel(opts).get(UNAVAILABLE);
            expect(entry).toBeDefined();
            expect(entry!.disabled).toBe(true);
        });

        it('includes an unknown/legacy current model id as an enabled entry', () => {
            const opts = getModelPickerOptions(USER_TIERS.FREE, {
                usageCounts: {},
                currentModel: 'legacy-model-no-longer-in-catalog',
            });
            expect(byModel(opts).get('legacy-model-no-longer-in-catalog'))
                .toEqual({ model: 'legacy-model-no-longer-in-catalog', disabled: false });
        });
    });

    describe('PAID tier', () => {
        it('lists the full catalog with no key set involved, all enabled, no suffixes', () => {
            const opts = getModelPickerOptions(USER_TIERS.PAID);
            expect(opts.map(o => o.model).sort()).toEqual(Object.keys(SupportedAiModels).sort());
            for (const o of opts) {
                expect(o.disabled).toBe(false);
                expect(o.suffix).toBeUndefined();
            }
        });

        it('includes a legacy current model as an enabled escape hatch', () => {
            const opts = getModelPickerOptions(USER_TIERS.PAID, {
                currentModel: 'legacy-model-no-longer-in-catalog',
            });
            expect(byModel(opts).get('legacy-model-no-longer-in-catalog'))
                .toEqual({ model: 'legacy-model-no-longer-in-catalog', disabled: false });
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
        ['grok-thinking', LLM_CONSTANTS.GROK],
        ['grok-fast', LLM_CONSTANTS.GROK],
        ['gpt-5.4', LLM_CONSTANTS.GPT],
        ['deepseek-chat', LLM_CONSTANTS.DEEPSEEK_FLASH],
        ['deepseek-reasoner', LLM_CONSTANTS.DEEPSEEK_FLASH],
        // '-thinking' picker ids retired 2026-08-05 when the catalog went thinking-only.
        ['claude-opus-thinking', LLM_CONSTANTS.CLAUDE_OPUS],
        ['claude-sonnet-thinking', LLM_CONSTANTS.CLAUDE_SONNET],
        ['claude-haiku-thinking', LLM_CONSTANTS.CLAUDE_HAIKU],
        ['deepseek-flash-thinking', LLM_CONSTANTS.DEEPSEEK_FLASH],
        ['deepseek-pro-thinking', LLM_CONSTANTS.DEEPSEEK_PRO],
        ['glm-thinking', LLM_CONSTANTS.GLM],
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
            validateModelUsageForTier(USER_TIERS.PAID, LLM_CONSTANTS.GPT_MINI, [legacy])
        ).not.toThrow();
    });

    it('lets a paid-tier user switch models in a game whose OTHER bot is still on a legacy ID', () => {
        expect(() =>
            validateModelUsageForTier(
                USER_TIERS.PAID,
                LLM_CONSTANTS.GPT_MINI,
                [LLM_CONSTANTS.GPT_MINI, 'kimi-thinking']
            )
        ).not.toThrow();
    });

    it('counts a legacy ID against its replacement free-tier budget, not a separate bucket', () => {
        // deepseek-flash is unlimited on the free tier, so use a capped model: the legacy
        // grok IDs both resolve to grok (3 bots/game).
        const usage: Record<string, number> = {};
        consumeModelUsage('grok-fast', USER_TIERS.FREE, usage, 'for bots');
        consumeModelUsage('grok-thinking', USER_TIERS.FREE, usage, 'for bots');
        consumeModelUsage(LLM_CONSTANTS.GROK, USER_TIERS.FREE, usage, 'for bots');

        expect(usage[LLM_CONSTANTS.GROK]).toBe(3);
        // A 4th would exceed grok's 3-bot free-tier cap.
        expect(() => consumeModelUsage('grok-fast', USER_TIERS.FREE, usage, 'for bots')).toThrow(
            /can only be used 3 times per game/
        );
    });

    it('still rejects a genuinely unsupported model', () => {
        expect(() =>
            validateModelUsageForTier(USER_TIERS.PAID, LLM_CONSTANTS.GPT_MINI, ['not-a-model'])
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
            validateModelUsageForTier(USER_TIERS.FREE, LLM_CONSTANTS.KIMI, [])
        ).toThrow(/not available on the free tier/);
    });

    it('remains selectable on paid tier', () => {
        expect(getCandidateModelsForTier(USER_TIERS.PAID)).toContain(LLM_CONSTANTS.KIMI);
    });
});
