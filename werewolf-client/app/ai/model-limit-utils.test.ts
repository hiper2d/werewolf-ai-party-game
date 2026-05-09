import {
    API_KEY_CONSTANTS,
    LLM_CONSTANTS,
    SupportedAiModels,
} from './ai-models';
import { USER_TIERS } from '@/app/api/game-models';
import {
    assertModelAllowedForApiTier,
    getAvailableModelsForUser,
    getCandidateModelsForTier,
    getProvidedApiKeyNames,
    validateModelUsageForTier,
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
