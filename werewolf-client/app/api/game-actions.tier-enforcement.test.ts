/**
 * Unit tests for tier enforcement at the game-creation level:
 * previewGame() and createGame() in app/api/game-actions.ts.
 *
 * These tests pin CURRENT behavior (including suspicious orderings) and use
 * the established mocking approach from night-replay.test.ts /
 * game-actions.free-tier.test.ts: everything external (firestore, auth,
 * agent factory, spending, voice config) is jest-mocked; no network calls.
 */

import { previewGame, createGame } from './game-actions';
import { GameCastingZodSchema } from '@/app/ai/prompts/zod-schemas';
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
import { API_KEY_CONSTANTS, LLM_CONSTANTS } from '@/app/ai/ai-models';
import {
    GamePreview,
    GamePreviewWithGeneratedBots,
    USER_TIERS,
} from '@/app/api/game-models';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

jest.mock('@/firebase/server', () => ({
    db: {
        collection: jest.fn(),
    },
}));

jest.mock('firebase-admin', () => ({
    firestore: {
        Timestamp: {
            fromMillis: jest.fn((ms: number) => ({ __millis: ms })),
        },
    },
}));

jest.mock('@/auth', () => ({
    auth: jest.fn(),
}));

jest.mock('@/app/utils/tier-utils', () => ({
    getUserTierAndApiKeys: jest.fn(),
    getApiKeysForUser: jest.fn(),
}));

// Spending / cost module
jest.mock('@/app/api/user-actions', () => ({
    getUserTier: jest.fn(),
    getUserBalance: jest.fn(),
    getVoiceProvider: jest.fn(),
    updateUserMonthlySpending: jest.fn(),
    deductBalance: jest.fn(),
}));

jest.mock('@/app/ai/agent-factory', () => ({
    AgentFactory: {
        createAgent: jest.fn(),
    },
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
// Test fixtures and helpers
// ---------------------------------------------------------------------------

const USER_EMAIL = 'tier-test@example.com';
const FIXED_NOW = 1750000000000;

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

function makeGameSetup(botCount: number) {
    return {
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
            visualDescription: `Look of bot ${i + 1}`,
        })),
    };
}

/**
 * The pipeline makes a casting call (scene + cast list) and then character-sheet
 * batch calls; answer each with the matching slice of the single fake setup. A batch
 * call gets every sheet — the pipeline picks out the names it asked for. Only the
 * casting call reports usage, so the summed preview usage equals `tokenUsage`.
 */
function stubAgentReturning(botCount: number, tokenUsage: any = DEFAULT_TOKEN_USAGE) {
    const setup = makeGameSetup(botCount);
    const agent = {
        userId: '',
        askWithZodSchema: jest.fn().mockImplementation(async (schema: unknown) => {
            if (schema === GameCastingZodSchema) {
                const { players, ...casting } = setup;
                return [{ ...casting, cast: players.map(p => ({ name: p.name, gender: p.gender })) }, 'raw-response', tokenUsage];
            }
            return [{ players: setup.players }, 'raw-response', undefined];
        }),
    };
    (AgentFactory.createAgent as jest.Mock).mockReturnValue(agent);
    return agent;
}

function makePreview(overrides: Partial<GamePreview> = {}): GamePreview {
    return {
        name: 'Human',
        theme: 'Test Theme',
        description: 'A test game',
        playerCount: 4, // 3 bots
        werewolfCount: 1,
        specialRoles: [],
        gameMasterAiType: LLM_CONSTANTS.DEEPSEEK_FLASH,
        playersAiType: [LLM_CONSTANTS.DEEPSEEK_FLASH],
        ...overrides,
    };
}

function makeGeneratedPreview(
    overrides: Partial<GamePreviewWithGeneratedBots> = {}
): GamePreviewWithGeneratedBots {
    const bot = (name: string, model: string, gender: 'male' | 'female' = 'male') => ({
        name,
        story: 'story',
        playerAiType: model,
        gender,
        voice: gender === 'male' ? 'm-voice' : 'f-voice',
        playStyle: 'normal',
    });
    return {
        ...makePreview(),
        scene: 'A generated scene',
        voiceProvider: 'openai' as any,
        gameMasterVoice: 'gm-voice',
        gameMasterVoiceStyle: 'calmly',
        bots: [
            bot('Bot1', LLM_CONSTANTS.DEEPSEEK_FLASH),
            bot('Bot2', LLM_CONSTANTS.DEEPSEEK_FLASH, 'female'),
            bot('Bot3', LLM_CONSTANTS.DEEPSEEK_FLASH),
        ],
        tokenUsage: { ...DEFAULT_TOKEN_USAGE },
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

/** Firestore mock for createGame (game doc set + message subcollection). */
function setupDbForCreate() {
    const setGame = jest.fn().mockResolvedValue(undefined);
    const setMessage = jest.fn().mockResolvedValue(undefined);
    const update = jest.fn().mockResolvedValue(undefined);
    const messageDoc = jest.fn().mockReturnValue({ set: setMessage });
    const gameDocRef = {
        set: setGame,
        update,
        get: jest.fn().mockResolvedValue({
            exists: true,
            data: () => ({ messageCounter: 0 }),
        }),
        collection: jest.fn().mockReturnValue({ doc: messageDoc }),
    };
    const doc = jest.fn().mockReturnValue(gameDocRef);
    (db!.collection as jest.Mock).mockReturnValue({ doc });
    return { setGame, setMessage, doc };
}

beforeEach(() => {
    jest.clearAllMocks();

    (auth as jest.Mock).mockResolvedValue({ user: { email: USER_EMAIL } });
    (getVoiceProvider as jest.Mock).mockResolvedValue('openai');
    (getVoiceConfig as jest.Mock).mockReturnValue(fakeVoiceConfig);
    (getUserBalance as jest.Mock).mockResolvedValue(10);
    (deductBalance as jest.Mock).mockResolvedValue(true);
    (updateUserMonthlySpending as jest.Mock).mockResolvedValue(undefined);

    // Deterministic randomness via a seeded LCG. (A constant value would
    // break the source-map library's randomized quicksort used by ts-jest
    // stack trace mapping, so a varying-but-deterministic sequence is used.)
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
// previewGame
// ---------------------------------------------------------------------------

describe('previewGame tier enforcement', () => {
    describe('free tier model restrictions', () => {
        it('rejects a premium GM model before calling the story agent', async () => {
            mockTier(USER_TIERS.FREE);
            setupDbForPreview(0);
            stubAgentReturning(3);

            await expect(
                previewGame(makePreview({ gameMasterAiType: LLM_CONSTANTS.CLAUDE_OPUS }))
            ).rejects.toThrow(
                `The AI model ${LLM_CONSTANTS.CLAUDE_OPUS} is not available on the free tier as the game master.`
            );

            // GM model is validated up-front, so no story-generation call is made.
            expect(AgentFactory.createAgent).not.toHaveBeenCalled();
            expect(deductBalance).not.toHaveBeenCalled();
        });

        it('rejects a premium bot model selection BEFORE the story agent runs (no charge)', async () => {
            mockTier(USER_TIERS.FREE);
            setupDbForPreview(0);
            const agent = stubAgentReturning(3);

            await expect(
                previewGame(makePreview({ playersAiType: [LLM_CONSTANTS.CLAUDE_OPUS] }))
            ).rejects.toThrow(
                `The AI model ${LLM_CONSTANTS.CLAUDE_OPUS} is not available on the free tier for bots. Please update your bot AI selection.`
            );

            // Validation now runs up front, so the LLM is never called and nothing is billed.
            expect(agent.askWithZodSchema).not.toHaveBeenCalled();
            expect(updateUserMonthlySpending).not.toHaveBeenCalled();
        });

        it('rejects when a single-use model is consumed by the GM and requested for a bot', async () => {
            mockTier(USER_TIERS.FREE);
            setupDbForPreview(0);
            stubAgentReturning(1);

            await expect(
                previewGame(
                    makePreview({
                        playerCount: 2, // 1 bot
                        gameMasterAiType: LLM_CONSTANTS.CLAUDE_HAIKU,
                        playersAiType: [LLM_CONSTANTS.CLAUDE_HAIKU],
                    })
                )
            ).rejects.toThrow(
                'No AI models are available for additional bots on the free tier with the current selection.'
            );
        });

        it('rejects when a capped model (DeepSeek Pro, max 3) is exhausted across GM + bots', async () => {
            mockTier(USER_TIERS.FREE);
            setupDbForPreview(0);
            stubAgentReturning(3);

            await expect(
                previewGame(
                    makePreview({
                        playerCount: 4, // 3 bots; GM + 3 bots = 4 > cap of 3
                        gameMasterAiType: LLM_CONSTANTS.DEEPSEEK_PRO,
                        playersAiType: [LLM_CONSTANTS.DEEPSEEK_PRO],
                    })
                )
            ).rejects.toThrow(
                'No AI models are available for additional bots on the free tier with the current selection.'
            );
        });

        it('allows a capped model exactly up to its per-game limit (GM + 2 bots = 3 DeepSeek Pro uses)', async () => {
            mockTier(USER_TIERS.FREE);
            setupDbForPreview(0);
            stubAgentReturning(2);

            const result = await previewGame(
                makePreview({
                    playerCount: 3, // 2 bots
                    gameMasterAiType: LLM_CONSTANTS.DEEPSEEK_PRO,
                    playersAiType: [LLM_CONSTANTS.DEEPSEEK_PRO],
                })
            );

            expect(result.gameMasterAiType).toBe(LLM_CONSTANTS.DEEPSEEK_PRO);
            expect(result.bots).toHaveLength(2);
            expect(result.bots.map(b => b.playerAiType)).toEqual([
                LLM_CONSTANTS.DEEPSEEK_PRO,
                LLM_CONSTANTS.DEEPSEEK_PRO,
            ]);
        });

        it('enforces the daily game-creation limit for free tier', async () => {
            mockTier(USER_TIERS.FREE);
            setupDbForPreview(5); // FREE_TIER_LIMITS.GAMES_PER_CALENDAR_DAY
            stubAgentReturning(3);

            await expect(previewGame(makePreview())).rejects.toThrow(
                'Free tier limit reached: you can create up to 5 games per day.'
            );
            expect(AgentFactory.createAgent).not.toHaveBeenCalled();
        });
    });

    describe('paid tier charging', () => {
        it('charges the preview cost plus the 15% markup and records spending', async () => {
            mockTier(USER_TIERS.PAID);
            stubAgentReturning(3, { ...DEFAULT_TOKEN_USAGE, costUSD: 0.5 });

            const result = await previewGame(makePreview());

            // 0.5 * (1 + 0.15) = 0.575
            expect(deductBalance).toHaveBeenCalledTimes(1);
            expect(deductBalance).toHaveBeenCalledWith(
                USER_EMAIL,
                expect.closeTo(0.575, 6)
            );
            // Monthly spending records the marked-up amount actually charged (0.575).
            expect(updateUserMonthlySpending).toHaveBeenCalledWith(
                USER_EMAIL,
                expect.closeTo(0.575, 6),
                USER_TIERS.PAID
            );
            expect(result.tokenUsage.costUSD).toBe(0.5);
        });

        it('fails when the balance deduction is rejected', async () => {
            mockTier(USER_TIERS.PAID);
            stubAgentReturning(3);
            (deductBalance as jest.Mock).mockResolvedValue(false);

            await expect(previewGame(makePreview())).rejects.toThrow(
                'Insufficient balance. Please add funds on your profile page before starting a game.'
            );
        });

        it('blocks paid-tier users with zero balance before any story generation', async () => {
            mockTier(USER_TIERS.PAID);
            stubAgentReturning(3);
            (getUserBalance as jest.Mock).mockResolvedValue(0);

            await expect(previewGame(makePreview())).rejects.toThrow(
                'Insufficient balance. Please add funds on your profile page before starting a game.'
            );
            expect(AgentFactory.createAgent).not.toHaveBeenCalled();
            expect(deductBalance).not.toHaveBeenCalled();
        });

        it('does not deduct balance for free-tier previews', async () => {
            mockTier(USER_TIERS.FREE);
            setupDbForPreview(0);
            stubAgentReturning(3);

            await previewGame(makePreview());

            expect(deductBalance).not.toHaveBeenCalled();
            expect(updateUserMonthlySpending).toHaveBeenCalledWith(
                USER_EMAIL,
                DEFAULT_TOKEN_USAGE.costUSD,
                USER_TIERS.FREE
            );
        });
    });

    describe('RANDOM game master resolution', () => {
        it('resolves RANDOM GM from the selected player models, respecting tier capacity', async () => {
            mockTier(USER_TIERS.FREE);
            setupDbForPreview(0);
            stubAgentReturning(3);

            const result = await previewGame(
                makePreview({
                    gameMasterAiType: LLM_CONSTANTS.RANDOM,
                    playersAiType: [LLM_CONSTANTS.DEEPSEEK_FLASH],
                })
            );

            expect(result.gameMasterAiType).toBe(LLM_CONSTANTS.DEEPSEEK_FLASH);
        });

        it('rejects RANDOM GM when none of the selected models has free-tier capacity', async () => {
            mockTier(USER_TIERS.FREE);
            setupDbForPreview(0);
            stubAgentReturning(3);

            await expect(
                previewGame(
                    makePreview({
                        gameMasterAiType: LLM_CONSTANTS.RANDOM,
                        playersAiType: [LLM_CONSTANTS.CLAUDE_OPUS],
                    })
                )
            ).rejects.toThrow(
                'No AI models are available for the game master on your current tier.'
            );
            expect(AgentFactory.createAgent).not.toHaveBeenCalled();
        });
    });
});

// ---------------------------------------------------------------------------
// createGame
// ---------------------------------------------------------------------------

describe('createGame tier enforcement', () => {
    beforeEach(() => {
        jest.spyOn(Date, 'now').mockReturnValue(FIXED_NOW);
    });

    it('rejects a premium GM model on the free tier without persisting anything', async () => {
        mockTier(USER_TIERS.FREE);
        const { setGame } = setupDbForCreate();

        await expect(
            createGame(
                makeGeneratedPreview({ gameMasterAiType: LLM_CONSTANTS.CLAUDE_OPUS })
            )
        ).rejects.toThrow(
            `Failed to create game: The AI model ${LLM_CONSTANTS.CLAUDE_OPUS} is not available on the free tier as the game master.`
        );
        expect(setGame).not.toHaveBeenCalled();
    });

    it('rejects free-tier games where a single-use model appears for both GM and a bot', async () => {
        mockTier(USER_TIERS.FREE);
        const { setGame } = setupDbForCreate();

        const preview = makeGeneratedPreview({
            gameMasterAiType: LLM_CONSTANTS.CLAUDE_HAIKU,
        });
        preview.bots[0].playerAiType = LLM_CONSTANTS.CLAUDE_HAIKU;

        await expect(createGame(preview)).rejects.toThrow(
            `Failed to create game: The AI model ${LLM_CONSTANTS.CLAUDE_HAIKU} can only be used once per game on the free tier.`
        );
        expect(setGame).not.toHaveBeenCalled();
    });

    it('rejects free-tier games exceeding a capped model limit across bots (DeepSeek Pro x4)', async () => {
        mockTier(USER_TIERS.FREE);
        const { setGame } = setupDbForCreate();

        const preview = makeGeneratedPreview({
            gameMasterAiType: LLM_CONSTANTS.DEEPSEEK_PRO,
        });
        preview.bots.forEach(bot => {
            bot.playerAiType = LLM_CONSTANTS.DEEPSEEK_PRO; // GM + 3 bots = 4 > 3
        });

        await expect(createGame(preview)).rejects.toThrow(
            `Failed to create game: The AI model ${LLM_CONSTANTS.DEEPSEEK_PRO} can only be used 3 times per game on the free tier.`
        );
        expect(setGame).not.toHaveBeenCalled();
    });

    it('rejects unresolved RANDOM GM model on the free tier', async () => {
        mockTier(USER_TIERS.FREE);
        setupDbForCreate();

        await expect(
            createGame(makeGeneratedPreview({ gameMasterAiType: LLM_CONSTANTS.RANDOM }))
        ).rejects.toThrow(
            'Failed to create game: Random AI model selections must be resolved before generating or saving a game.'
        );
    });

    it('paid tier rejects an unresolved RANDOM GM model instead of saving it (#5)', async () => {
        // validateModelUsageForTier now rejects the RANDOM placeholder (and unknown
        // model ids) on the paid tier too, so it can never be persisted.
        mockTier(USER_TIERS.PAID);
        const { setGame } = setupDbForCreate();

        await expect(
            createGame(makeGeneratedPreview({ gameMasterAiType: LLM_CONSTANTS.RANDOM }))
        ).rejects.toThrow(
            'Failed to create game: Random AI model selections must be resolved before generating or saving a game.'
        );

        expect(setGame).not.toHaveBeenCalled();
    });

    it('creates a valid free-tier game and never touches the balance', async () => {
        mockTier(USER_TIERS.FREE);
        const { setGame } = setupDbForCreate();

        const gameId = await createGame(makeGeneratedPreview());

        expect(gameId).toBe(`test-theme-${FIXED_NOW}`);
        expect(setGame).toHaveBeenCalledWith(
            expect.objectContaining({
                createdWithTier: USER_TIERS.FREE,
                gameMasterAiType: LLM_CONSTANTS.DEEPSEEK_FLASH,
                totalGameCost: DEFAULT_TOKEN_USAGE.costUSD,
            })
        );
        expect(deductBalance).not.toHaveBeenCalled();
        expect(updateUserMonthlySpending).not.toHaveBeenCalled();
    });

    it('does not charge the paid tier a second time at createGame (preview already paid)', async () => {
        mockTier(USER_TIERS.PAID);
        const { setGame } = setupDbForCreate();

        const gameId = await createGame(makeGeneratedPreview());

        expect(gameId).toBe(`test-theme-${FIXED_NOW}`);
        expect(setGame).toHaveBeenCalledWith(
            expect.objectContaining({ createdWithTier: USER_TIERS.PAID })
        );
        expect(deductBalance).not.toHaveBeenCalled();
        expect(updateUserMonthlySpending).not.toHaveBeenCalled();
    });
});
