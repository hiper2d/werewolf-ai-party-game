/**
 * Unit tests for human-player role assignment in createGame()
 * (app/api/game-actions.ts).
 *
 * Focus: the "Your Role" selection (gamePreview.humanPlayerRole) and the role
 * distribution that feeds it. Reuses the mocking approach from
 * game-actions.tier-enforcement.test.ts — everything external (firestore, auth,
 * agent factory, spending, voice config) is jest-mocked; no network calls.
 *
 * The key invariant: choosing a role only changes WHICH player holds it
 * (the human, slot 0), never the overall multiset of roles in the game.
 */

import { createGame } from './game-actions';
import { db } from '@/firebase/server';
import { auth } from '@/auth';
import { getUserTierAndApiKeys } from '@/app/utils/tier-utils';
import {
    getUserBalance,
    getVoiceProvider,
    updateUserMonthlySpending,
    deductBalance,
} from '@/app/api/user-actions';
import { getVoiceConfig } from '@/app/ai/voice-config';
import { LLM_CONSTANTS } from '@/app/ai/ai-models';
import {
    GAME_ROLES,
    GamePreviewWithGeneratedBots,
    RANDOM_ROLE,
    USER_TIERS,
} from '@/app/api/game-models';

// ---------------------------------------------------------------------------
// Module mocks (mirror game-actions.tier-enforcement.test.ts)
// ---------------------------------------------------------------------------

jest.mock('@/firebase/server', () => ({
    db: { collection: jest.fn() },
}));

jest.mock('firebase-admin', () => ({
    firestore: {
        Timestamp: {
            fromMillis: jest.fn((ms: number) => ({ __millis: ms })),
        },
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

const USER_EMAIL = 'role-test@example.com';

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

/**
 * Build a generated preview with `playerCount - 1` bots (slot 0 is the human),
 * so the role distribution exactly fills every player.
 */
function makeGeneratedPreview(
    overrides: Partial<GamePreviewWithGeneratedBots> & { playerCount: number }
): GamePreviewWithGeneratedBots {
    const { playerCount } = overrides;
    const botCount = playerCount - 1;
    const bots = Array.from({ length: botCount }, (_, i) => ({
        name: `Bot${i + 1}`,
        story: 'story',
        playerAiType: LLM_CONSTANTS.DEEPSEEK_V4_FLASH,
        gender: (i % 2 === 0 ? 'male' : 'female') as 'male' | 'female',
        voice: i % 2 === 0 ? 'm-voice' : 'f-voice',
        playStyle: 'normal',
    }));
    return {
        name: 'Human',
        theme: 'Test Theme',
        description: 'A test game',
        werewolfCount: 1,
        specialRoles: [],
        gameMasterAiType: LLM_CONSTANTS.DEEPSEEK_V4_FLASH,
        playersAiType: [LLM_CONSTANTS.DEEPSEEK_V4_FLASH],
        scene: 'A generated scene',
        voiceProvider: 'openai' as any,
        gameMasterVoice: 'gm-voice',
        gameMasterVoiceStyle: 'calmly',
        bots,
        tokenUsage: { ...DEFAULT_TOKEN_USAGE },
        ...overrides,
    };
}

function mockTier(tier: string, apiKeys: Record<string, string> = {}) {
    (getUserTierAndApiKeys as jest.Mock).mockResolvedValue({ tier, apiKeys });
}

/** Firestore mock for createGame; returns the captured `set` spy for the game doc. */
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
    return { setGame };
}

/** All roles in the created game (human + bots), as a {role: count} multiset. */
function roleCounts(setGame: jest.Mock): Record<string, number> {
    const game = setGame.mock.calls[0][0];
    const roles: string[] = [game.humanPlayerRole, ...game.bots.map((b: any) => b.role)];
    return roles.reduce((acc: Record<string, number>, r) => {
        acc[r] = (acc[r] ?? 0) + 1;
        return acc;
    }, {});
}

function humanRole(setGame: jest.Mock): string {
    return setGame.mock.calls[0][0].humanPlayerRole;
}

beforeEach(() => {
    jest.clearAllMocks();

    (auth as jest.Mock).mockResolvedValue({ user: { email: USER_EMAIL } });
    (getVoiceProvider as jest.Mock).mockResolvedValue('openai');
    (getVoiceConfig as jest.Mock).mockReturnValue(fakeVoiceConfig);
    (getUserBalance as jest.Mock).mockResolvedValue(10);
    (deductBalance as jest.Mock).mockResolvedValue(true);
    (updateUserMonthlySpending as jest.Mock).mockResolvedValue(undefined);
    mockTier(USER_TIERS.PAID); // paid tier skips model/limit validation noise

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
// Tests
// ---------------------------------------------------------------------------

describe('createGame human role assignment', () => {
    // A 4-player game where every slot is a distinct role:
    // doctor + detective + maniac + 1 werewolf, 0 villagers.
    const fullSpecialPreview = (humanPlayerRole?: string) =>
        makeGeneratedPreview({
            playerCount: 4,
            werewolfCount: 1,
            specialRoles: [GAME_ROLES.DOCTOR, GAME_ROLES.DETECTIVE, GAME_ROLES.MANIAC],
            humanPlayerRole,
        });

    it('gives the human the exact special role they chose (deterministic, RNG-independent)', async () => {
        const { setGame } = setupDbForCreate();

        await createGame(fullSpecialPreview(GAME_ROLES.DOCTOR));

        expect(humanRole(setGame)).toBe(GAME_ROLES.DOCTOR);
    });

    it('lets the human choose werewolf', async () => {
        const { setGame } = setupDbForCreate();

        await createGame(fullSpecialPreview(GAME_ROLES.WEREWOLF));

        expect(humanRole(setGame)).toBe(GAME_ROLES.WEREWOLF);
    });

    it('honoring the choice does not duplicate or drop any role', async () => {
        const { setGame } = setupDbForCreate();

        await createGame(fullSpecialPreview(GAME_ROLES.DETECTIVE));

        // Each of the four roles still appears exactly once across all players.
        expect(roleCounts(setGame)).toEqual({
            [GAME_ROLES.DOCTOR]: 1,
            [GAME_ROLES.DETECTIVE]: 1,
            [GAME_ROLES.MANIAC]: 1,
            [GAME_ROLES.WEREWOLF]: 1,
        });
    });

    it('selecting villager pulls a villager out of the distribution for the human', async () => {
        // 6 players: 1 werewolf + 1 doctor + 4 villagers.
        const { setGame } = setupDbForCreate();

        await createGame(
            makeGeneratedPreview({
                playerCount: 6,
                werewolfCount: 1,
                specialRoles: [GAME_ROLES.DOCTOR],
                humanPlayerRole: GAME_ROLES.VILLAGER,
            })
        );

        expect(humanRole(setGame)).toBe(GAME_ROLES.VILLAGER);
        expect(roleCounts(setGame)).toEqual({
            [GAME_ROLES.WEREWOLF]: 1,
            [GAME_ROLES.DOCTOR]: 1,
            [GAME_ROLES.VILLAGER]: 4,
        });
    });

    it('RANDOM_ROLE leaves the human with a role from the distribution, counts intact', async () => {
        const { setGame } = setupDbForCreate();

        await createGame(fullSpecialPreview(RANDOM_ROLE));

        expect(roleCounts(setGame)).toEqual({
            [GAME_ROLES.DOCTOR]: 1,
            [GAME_ROLES.DETECTIVE]: 1,
            [GAME_ROLES.MANIAC]: 1,
            [GAME_ROLES.WEREWOLF]: 1,
        });
        // Whatever the shuffle picked, it's one of the real roles in play.
        expect([
            GAME_ROLES.DOCTOR,
            GAME_ROLES.DETECTIVE,
            GAME_ROLES.MANIAC,
            GAME_ROLES.WEREWOLF,
        ]).toContain(humanRole(setGame));
    });

    it('omitting humanPlayerRole behaves like random (counts intact)', async () => {
        const { setGame } = setupDbForCreate();

        await createGame(fullSpecialPreview(undefined));

        expect(roleCounts(setGame)).toEqual({
            [GAME_ROLES.DOCTOR]: 1,
            [GAME_ROLES.DETECTIVE]: 1,
            [GAME_ROLES.MANIAC]: 1,
            [GAME_ROLES.WEREWOLF]: 1,
        });
    });

    it('requesting a role absent from the distribution falls back gracefully', async () => {
        // Doctor is NOT among the special roles, so it cannot be assigned;
        // the human keeps whatever the shuffle produced, counts unchanged.
        const { setGame } = setupDbForCreate();

        await createGame(
            makeGeneratedPreview({
                playerCount: 6,
                werewolfCount: 1,
                specialRoles: [], // no doctor in play
                humanPlayerRole: GAME_ROLES.DOCTOR,
            })
        );

        expect(humanRole(setGame)).not.toBe(GAME_ROLES.DOCTOR);
        expect(roleCounts(setGame)).toEqual({
            [GAME_ROLES.WEREWOLF]: 1,
            [GAME_ROLES.VILLAGER]: 5,
        });
    });
});
