/**
 * Unit tests for normalized player-model allocation in previewGame()
 * (app/api/game-actions.ts, lines ~278-385).
 *
 * This is the round-robin "deck" mechanic that hands each generated bot an AI
 * model. The tier-enforcement suite only exercises it incidentally (via
 * capacity caps); these tests pin the distribution behavior itself:
 *   - even/fair spread across the selected models (the shuffle-and-deal deck)
 *   - dedup of the candidate basis so a model isn't double-weighted
 *   - RANDOM expansion into the tier candidate pool (array + legacy string)
 *   - empty selection treated as RANDOM
 *   - capacity-aware dropout mid-allocation on the free tier, and its error path
 *
 * Mocking mirrors game-actions.tier-enforcement.test.ts: everything external
 * is jest-mocked; the per-game limit helpers (model-limit-utils) run for real
 * so the capacity behavior is genuine.
 */

import { previewGame } from './game-actions';
import { db } from '@/firebase/server';
import { auth } from '@/auth';
import { AgentFactory } from '@/app/ai/agent-factory';
import { getUserTierAndApiKeys } from '@/app/utils/tier-utils';
import {
    getUserBalance,
    getVoiceProvider,
    updateUserMonthlySpending,
    deductBalance,
} from '@/app/api/user-actions';
import { getVoiceConfig } from '@/app/ai/voice-config';
import { LLM_CONSTANTS } from '@/app/ai/ai-models';
import { getCandidateModelsForTier } from '@/app/ai/model-limit-utils';
import { GamePreview, USER_TIERS } from '@/app/api/game-models';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

jest.mock('@/firebase/server', () => ({
    db: { collection: jest.fn() },
}));

jest.mock('firebase-admin', () => ({
    firestore: {
        Timestamp: { fromMillis: jest.fn((ms: number) => ({ __millis: ms })) },
    },
}));

jest.mock('@/auth', () => ({ auth: jest.fn() }));

jest.mock('@/app/utils/tier-utils', () => ({
    getUserTierAndApiKeys: jest.fn(),
    getApiKeysForUser: jest.fn(),
}));

jest.mock('@/app/api/user-actions', () => ({
    getUserTier: jest.fn(),
    getUserBalance: jest.fn(),
    getVoiceProvider: jest.fn(),
    updateUserMonthlySpending: jest.fn(),
    deductBalance: jest.fn(),
}));

jest.mock('@/app/ai/agent-factory', () => ({
    AgentFactory: { createAgent: jest.fn() },
}));

jest.mock('@/app/ai/voice-config', () => ({
    getDefaultVoiceProvider: jest.fn(() => 'openai'),
    getVoiceConfig: jest.fn(),
}));

jest.mock('@/app/api/tier-guards', () => ({
    ensureUserCanAccessGame: jest.fn(),
}));

jest.mock('@/app/utils/logger', () => ({
    logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
        agentActivity: jest.fn(),
    },
}));

// ---------------------------------------------------------------------------
// Fixtures and helpers
// ---------------------------------------------------------------------------

const USER_EMAIL = 'alloc-test@example.com';

const DEFAULT_TOKEN_USAGE = {
    inputTokens: 100,
    outputTokens: 200,
    totalTokens: 300,
    costUSD: 0.5,
};

const fakeVoiceConfig = {
    getPromptDescription: () => 'fake voice list',
    getVoiceById: (id: string) =>
        ['m-voice', 'f-voice', 'gm-voice'].includes(id) ? { id } : undefined,
    getVoicesByGender: (gender: string) =>
        gender === 'male' ? [{ id: 'm-voice' }] : [{ id: 'f-voice' }],
};

/** Agent whose generated story returns exactly `botCount` players. */
function stubAgentReturning(botCount: number) {
    const setup = {
        scene: 'A deterministic test scene',
        gameMasterVoice: 'gm-voice',
        gameMasterVoiceStyle: 'calmly',
        players: Array.from({ length: botCount }, (_, i) => ({
            name: `Bot${i + 1}`,
            gender: i % 2 === 0 ? 'male' : 'female',
            story: `Backstory for bot ${i + 1}`,
            playStyle: 'normal',
            voice: i % 2 === 0 ? 'm-voice' : 'f-voice',
            voiceStyle: 'softly',
        })),
    };
    (AgentFactory.createAgent as jest.Mock).mockReturnValue({
        userId: '',
        askWithZodSchema: jest
            .fn()
            .mockResolvedValue([setup, 'raw-response', DEFAULT_TOKEN_USAGE]),
    });
}

/**
 * Build a preview with `playerCount` players (so `playerCount - 1` bots), and
 * stub the story agent to return exactly that many bots.
 */
function makePreview(
    playerCount: number,
    overrides: Partial<GamePreview> = {}
): GamePreview {
    stubAgentReturning(playerCount - 1);
    return {
        name: 'Human',
        theme: 'Test Theme',
        description: 'A test game',
        playerCount,
        werewolfCount: 1,
        specialRoles: [],
        gameMasterAiType: LLM_CONSTANTS.DEEPSEEK_V4_FLASH,
        playersAiType: [LLM_CONSTANTS.DEEPSEEK_V4_FLASH],
        ...overrides,
    };
}

function mockTier(tier: string, apiKeys: Record<string, string> = {}) {
    (getUserTierAndApiKeys as jest.Mock).mockResolvedValue({ tier, apiKeys });
}

/** Firestore mock for previewGame's free-tier daily-limit query. */
function setupDbForPreview(todaysGameCount = 0) {
    const get = jest.fn().mockResolvedValue({ size: todaysGameCount });
    const where2 = jest.fn().mockReturnValue({ get });
    const where1 = jest.fn().mockReturnValue({ where: where2 });
    (db!.collection as jest.Mock).mockReturnValue({ where: where1 });
}

/** {model: count} over the generated bots' assigned AI types. */
function modelCounts(bots: { playerAiType: string }[]): Record<string, number> {
    return bots.reduce((acc: Record<string, number>, b) => {
        acc[b.playerAiType] = (acc[b.playerAiType] ?? 0) + 1;
        return acc;
    }, {});
}

beforeEach(() => {
    jest.clearAllMocks();

    (auth as jest.Mock).mockResolvedValue({ user: { email: USER_EMAIL } });
    (getVoiceProvider as jest.Mock).mockResolvedValue('openai');
    (getVoiceConfig as jest.Mock).mockReturnValue(fakeVoiceConfig);
    (getUserBalance as jest.Mock).mockResolvedValue(10);
    (deductBalance as jest.Mock).mockResolvedValue(true);
    (updateUserMonthlySpending as jest.Mock).mockResolvedValue(undefined);

    // Deterministic randomness via a seeded LCG. (A constant value would break
    // the source-map library's randomized quicksort used by ts-jest stack-trace
    // mapping, so a varying-but-deterministic sequence is used.)
    let seed = 42;
    jest.spyOn(Math, 'random').mockImplementation(() => {
        seed = (seed * 1664525 + 1013904223) % 4294967296;
        return seed / 4294967296;
    });
});

afterEach(() => {
    jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// PAID tier: pure round-robin (no capacity caps) → fair distribution
// ---------------------------------------------------------------------------

describe('previewGame model allocation — fair distribution (paid tier)', () => {
    const TWO_MODELS = [LLM_CONSTANTS.DEEPSEEK_V4_FLASH, LLM_CONSTANTS.CLAUDE_4_HAIKU];

    it('spreads two selected models evenly when bot count divides evenly', async () => {
        mockTier(USER_TIERS.PAID);

        // 7 players → 6 bots, 2 models → exactly 3 each.
        const result = await previewGame(
            makePreview(7, { playersAiType: TWO_MODELS })
        );

        expect(result.bots).toHaveLength(6);
        expect(modelCounts(result.bots)).toEqual({
            [LLM_CONSTANTS.DEEPSEEK_V4_FLASH]: 3,
            [LLM_CONSTANTS.CLAUDE_4_HAIKU]: 3,
        });
    });

    it('spreads two models as evenly as possible when bot count is odd (off by at most 1)', async () => {
        mockTier(USER_TIERS.PAID);

        // 6 players → 5 bots, 2 models → counts {3, 2} in some order.
        const result = await previewGame(
            makePreview(6, { playersAiType: TWO_MODELS })
        );

        expect(result.bots).toHaveLength(5);
        const counts = Object.values(modelCounts(result.bots)).sort();
        expect(counts).toEqual([2, 3]);
    });

    it('spreads three selected models evenly across a divisible bot count', async () => {
        mockTier(USER_TIERS.PAID);
        const threeModels = [
            LLM_CONSTANTS.DEEPSEEK_V4_FLASH,
            LLM_CONSTANTS.CLAUDE_4_HAIKU,
            LLM_CONSTANTS.GPT_5_6_TERRA,
        ];

        // 10 players → 9 bots, 3 models → exactly 3 each.
        const result = await previewGame(
            makePreview(10, { playersAiType: threeModels })
        );

        expect(result.bots).toHaveLength(9);
        expect(modelCounts(result.bots)).toEqual({
            [LLM_CONSTANTS.DEEPSEEK_V4_FLASH]: 3,
            [LLM_CONSTANTS.CLAUDE_4_HAIKU]: 3,
            [LLM_CONSTANTS.GPT_5_6_TERRA]: 3,
        });
    });

    it('dedupes the candidate basis so a repeated model is not over-weighted', async () => {
        mockTier(USER_TIERS.PAID);

        // A duplicate in the selection must not skew the split toward it:
        // [deepseek, deepseek, haiku] → basis {deepseek, haiku} → 3/3, not 4/2.
        const result = await previewGame(
            makePreview(7, {
                playersAiType: [
                    LLM_CONSTANTS.DEEPSEEK_V4_FLASH,
                    LLM_CONSTANTS.DEEPSEEK_V4_FLASH,
                    LLM_CONSTANTS.CLAUDE_4_HAIKU,
                ],
            })
        );

        expect(modelCounts(result.bots)).toEqual({
            [LLM_CONSTANTS.DEEPSEEK_V4_FLASH]: 3,
            [LLM_CONSTANTS.CLAUDE_4_HAIKU]: 3,
        });
    });
});

// ---------------------------------------------------------------------------
// RANDOM expansion into the tier candidate pool
// ---------------------------------------------------------------------------

describe('previewGame model allocation — RANDOM expansion (paid tier)', () => {
    it('expands a RANDOM entry in the array to the tier candidate pool', async () => {
        mockTier(USER_TIERS.PAID);
        const pool = new Set(getCandidateModelsForTier(USER_TIERS.PAID));

        const result = await previewGame(
            makePreview(6, { playersAiType: [LLM_CONSTANTS.RANDOM] })
        );

        expect(result.bots).toHaveLength(5);
        for (const bot of result.bots) {
            expect(pool.has(bot.playerAiType)).toBe(true);
        }
    });

    it('expands the legacy RANDOM string (non-array playersAiType)', async () => {
        mockTier(USER_TIERS.PAID);
        const pool = new Set(getCandidateModelsForTier(USER_TIERS.PAID));

        const result = await previewGame(
            makePreview(6, { playersAiType: LLM_CONSTANTS.RANDOM })
        );

        for (const bot of result.bots) {
            expect(pool.has(bot.playerAiType)).toBe(true);
        }
    });

    it('treats an empty selection array as RANDOM', async () => {
        mockTier(USER_TIERS.PAID);
        const pool = new Set(getCandidateModelsForTier(USER_TIERS.PAID));

        const result = await previewGame(makePreview(6, { playersAiType: [] }));

        expect(result.bots).toHaveLength(5);
        for (const bot of result.bots) {
            expect(pool.has(bot.playerAiType)).toBe(true);
        }
    });
});

// ---------------------------------------------------------------------------
// FREE tier: capacity-aware dropout mid-allocation
// ---------------------------------------------------------------------------

describe('previewGame model allocation — free-tier capacity dropout', () => {
    it('caps a limited model and fills the remaining bots with an unlimited one', async () => {
        mockTier(USER_TIERS.FREE);
        setupDbForPreview(0);

        // GM uses the unlimited model so it does not eat into Haiku's budget.
        // Haiku is capped at 3 bots/game; the rest of the 8 bots fall to Deepseek.
        const result = await previewGame(
            makePreview(9, {
                gameMasterAiType: LLM_CONSTANTS.DEEPSEEK_V4_FLASH,
                playersAiType: [
                    LLM_CONSTANTS.CLAUDE_4_HAIKU,
                    LLM_CONSTANTS.DEEPSEEK_V4_FLASH,
                ],
            })
        );

        expect(result.bots).toHaveLength(8);
        expect(modelCounts(result.bots)).toEqual({
            [LLM_CONSTANTS.CLAUDE_4_HAIKU]: 3, // exactly its per-game cap
            [LLM_CONSTANTS.DEEPSEEK_V4_FLASH]: 5,
        });
    });

    it('throws when the only selected model runs out of per-game capacity', async () => {
        mockTier(USER_TIERS.FREE);
        setupDbForPreview(0);

        // Only Haiku selected (cap 3), GM on Deepseek, but 5 bots requested:
        // after 3 Haiku bots there are no valid candidates left.
        await expect(
            previewGame(
                makePreview(6, {
                    gameMasterAiType: LLM_CONSTANTS.DEEPSEEK_V4_FLASH,
                    playersAiType: [LLM_CONSTANTS.CLAUDE_4_HAIKU],
                })
            )
        ).rejects.toThrow(
            'No AI models are available for additional bots on the free tier'
        );
    });
});
