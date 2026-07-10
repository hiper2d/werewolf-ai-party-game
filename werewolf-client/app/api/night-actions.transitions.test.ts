/**
 * Unit tests for the night-phase state transitions in app/api/night-actions.ts:
 * performNightAction dispatch, beginNight role-queue setup, role-to-role queue
 * advancement, night end, and human-player turn handling.
 *
 * Night-action RESOLUTION rules (who dies, saves, abductions) are covered by
 * app/api/roles/night-resolution.test.ts; replayNight by night-replay.test.ts.
 * Neither is duplicated here.
 *
 * These tests pin CURRENT behavior. All Firestore / auth / AI calls are mocked;
 * Math.random and Date.now are pinned for determinism.
 */

import { performNightAction, summarizePastDay, selectDayResponders } from './night-actions';
import { db } from '@/firebase/server';
import { auth } from '@/auth';
import { AgentFactory } from '@/app/ai/agent-factory';
import {
    Bot,
    GAME_ROLES,
    GAME_STATES,
    Game,
    MessageType,
} from '@/app/api/game-models';

// ---------------------------------------------------------------------------
// Mocks (same harness as bot-actions.queues.test.ts)
// ---------------------------------------------------------------------------

jest.mock('@/firebase/server', () => ({
    db: {
        collection: jest.fn(),
        runTransaction: jest.fn(),
    },
}));

jest.mock('@/auth', () => ({
    auth: jest.fn(),
}));

jest.mock('@/app/api/game-actions', () => ({
    getGame: jest.fn(),
    getGameMessages: jest.fn(),
    getBotMessages: jest.fn(),
    getUserFromFirestore: jest.fn(),
    addMessageToChatAndSaveToDb: jest.fn(),
    setGameErrorState: jest.fn(),
}));

jest.mock('@/app/utils/tier-utils', () => ({
    getApiKeysForUser: jest.fn(),
}));

jest.mock('@/app/api/tier-guards', () => ({
    ensureUserCanAccessGame: jest.fn(),
}));

jest.mock('@/app/api/cost-tracking', () => ({
    recordBotTokenUsage: jest.fn(),
    recordGameMasterTokenUsage: jest.fn(),
}));

jest.mock('@/app/ai/agent-factory', () => ({
    AgentFactory: {
        createAgent: jest.fn(),
    },
}));

jest.mock('@/app/utils/logger', () => ({
    logger: {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    },
}));

import {
    addMessageToChatAndSaveToDb,
    getBotMessages,
    getGame,
    setGameErrorState,
} from '@/app/api/game-actions';
import { getApiKeysForUser } from '@/app/utils/tier-utils';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const GAME_ID = 'test-game-id';
const USER_EMAIL = 'test@example.com';
const HUMAN_NAME = 'Human';
const FIXED_NOW = 1700000000000;

function makeBot(name: string, overrides: Partial<Bot> = {}): Bot {
    return {
        name,
        story: `${name} story`,
        role: GAME_ROLES.VILLAGER,
        isAlive: true,
        aiType: 'mock-model',
        gender: 'male',
        voice: 'mock-voice',
        playStyle: 'unknown-style',
        ...overrides,
    };
}

function makeGame(overrides: Partial<Game> = {}): Game {
    return {
        id: GAME_ID,
        description: 'desc',
        theme: 'theme',
        werewolfCount: 1,
        specialRoles: [GAME_ROLES.DOCTOR],
        gameMasterAiType: 'mock-gm-model',
        gameMasterVoice: 'gm-voice',
        story: 'story',
        bots: [
            makeBot('Wolf', { role: GAME_ROLES.WEREWOLF }),
            makeBot('Doc', { role: GAME_ROLES.DOCTOR }),
            makeBot('Vil'),
        ],
        humanPlayerName: HUMAN_NAME,
        humanPlayerRole: GAME_ROLES.VILLAGER,
        currentDay: 1,
        gameState: GAME_STATES.NIGHT,
        gameStateParamQueue: [],
        gameStateProcessQueue: [],
        dayActivityCounter: {},
        ownerEmail: USER_EMAIL,
        createdWithTier: 'free' as Game['createdWithTier'],
        ...overrides,
    };
}

let mockUpdate: jest.Mock;
let mockAskWithZodSchema: jest.Mock;
let mockAskText: jest.Mock;

function updatesWith(field: string): any[] {
    return mockUpdate.mock.calls
        .map(([arg]) => arg)
        .filter((arg) => arg && Object.prototype.hasOwnProperty.call(arg, field));
}

function savedMessages(): any[] {
    return (addMessageToChatAndSaveToDb as jest.Mock).mock.calls.map(([m]) => m);
}

function expectErrorState(messagePart: string) {
    expect(setGameErrorState).toHaveBeenCalledWith(
        GAME_ID,
        expect.objectContaining({ error: expect.stringContaining(messagePart) })
    );
}

beforeEach(() => {
    jest.clearAllMocks();

    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    jest.spyOn(Date, 'now').mockReturnValue(FIXED_NOW);

    (auth as jest.Mock).mockResolvedValue({ user: { email: USER_EMAIL } });
    (getApiKeysForUser as jest.Mock).mockResolvedValue({});
    (getBotMessages as jest.Mock).mockResolvedValue([]);
    (addMessageToChatAndSaveToDb as jest.Mock).mockImplementation(
        async (message: any) => ({ ...message, id: 'saved-msg-id' })
    );
    (setGameErrorState as jest.Mock).mockImplementation(async (gameId: string, errorState: any) => ({
        ...makeGame(),
        errorState,
    }));

    mockUpdate = jest.fn().mockResolvedValue(undefined);
    const mockDoc = jest.fn(() => ({
        update: mockUpdate,
        get: jest.fn(async () => ({ exists: true, data: () => makeGame() })),
        collection: jest.fn(),
    }));
    (db!.collection as jest.Mock).mockReturnValue({ doc: mockDoc });

    mockAskWithZodSchema = jest.fn();
    // GM night story and day summaries are plain-text asks now.
    mockAskText = jest.fn().mockResolvedValue([
        'The night passes quietly.',
        '',
        undefined,
        undefined,
    ]);
    (AgentFactory.createAgent as jest.Mock).mockReturnValue({
        askWithZodSchema: mockAskWithZodSchema,
        askText: mockAskText,
        gameId: '',
        userId: '',
    });
});

afterEach(() => {
    jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// performNightAction dispatch
// ---------------------------------------------------------------------------

describe('performNightAction dispatch', () => {
    test('invalid state (DAY_DISCUSSION) is a benign no-op (no errorState)', async () => {
        const game = makeGame({ gameState: GAME_STATES.DAY_DISCUSSION });
        (getGame as jest.Mock).mockResolvedValue(game);

        const result = await performNightAction(GAME_ID);

        expect(setGameErrorState).not.toHaveBeenCalled();
        expect(result.game.errorState).toBeFalsy();
        expect(result.game.gameState).toBe(GAME_STATES.DAY_DISCUSSION);
        expect(result.messages).toEqual([]);
        expect(mockUpdate).not.toHaveBeenCalled();
    });

    test('NIGHT_RESULTS is a no-op returning the current game', async () => {
        const game = makeGame({ gameState: GAME_STATES.NIGHT_RESULTS });
        (getGame as jest.Mock).mockResolvedValue(game);

        const result = await performNightAction(GAME_ID);

        expect(result.game).toBe(game);
        expect(result.messages).toEqual([]);
        expect(mockUpdate).not.toHaveBeenCalled();
        expect(setGameErrorState).not.toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// beginNight (VOTE_RESULTS -> NIGHT)
// ---------------------------------------------------------------------------

describe('beginNight: role queue setup', () => {
    test('builds the role queue from alive special roles in nightActionOrder and saves NIGHT_BEGINS', async () => {
        const game = makeGame({ gameState: GAME_STATES.VOTE_RESULTS });
        (getGame as jest.Mock).mockResolvedValue(game);

        await performNightAction(GAME_ID);

        // werewolf (order 1) before doctor (order 2); villager has no night action.
        const update = updatesWith('gameState')[0];
        expect(update.gameState).toBe(GAME_STATES.NIGHT);
        expect(update.gameStateProcessQueue).toEqual([GAME_ROLES.WEREWOLF, GAME_ROLES.DOCTOR]);
        // First role (werewolf) initialized: its param queue holds the wolf pack.
        expect(update.gameStateParamQueue).toEqual(expect.arrayContaining(['Wolf']));

        expect(savedMessages()[0]).toMatchObject({
            messageType: MessageType.NIGHT_BEGINS,
        });
        expect(setGameErrorState).not.toHaveBeenCalled();
    });

    test('dead role-holders are excluded from the role queue', async () => {
        const game = makeGame({
            gameState: GAME_STATES.VOTE_RESULTS,
            bots: [
                makeBot('Wolf', { role: GAME_ROLES.WEREWOLF }),
                makeBot('Doc', { role: GAME_ROLES.DOCTOR, isAlive: false }),
            ],
        });
        (getGame as jest.Mock).mockResolvedValue(game);

        await performNightAction(GAME_ID);

        const update = updatesWith('gameState')[0];
        expect(update.gameStateProcessQueue).toEqual([GAME_ROLES.WEREWOLF]);
    });

    test("the human player's special role joins the queue even with no bot holding it", async () => {
        const game = makeGame({
            gameState: GAME_STATES.VOTE_RESULTS,
            humanPlayerRole: GAME_ROLES.DETECTIVE,
            bots: [makeBot('Wolf', { role: GAME_ROLES.WEREWOLF })],
        });
        (getGame as jest.Mock).mockResolvedValue(game);

        await performNightAction(GAME_ID);

        const update = updatesWith('gameState')[0];
        expect(update.gameStateProcessQueue).toEqual([GAME_ROLES.WEREWOLF, GAME_ROLES.DETECTIVE]);
    });
});

// ---------------------------------------------------------------------------
// NIGHT: queue advancement
// ---------------------------------------------------------------------------

describe('night queue advancement', () => {
    test('empty param queue advances to the next role and initializes its player queue', async () => {
        const game = makeGame({
            gameStateProcessQueue: [GAME_ROLES.WEREWOLF, GAME_ROLES.DOCTOR],
            gameStateParamQueue: [],
        });
        (getGame as jest.Mock).mockResolvedValue(game);

        await performNightAction(GAME_ID);

        expect(mockUpdate).toHaveBeenCalledWith({
            gameStateProcessQueue: [GAME_ROLES.DOCTOR],
            gameStateParamQueue: ['Doc'],
        });
        expect(setGameErrorState).not.toHaveBeenCalled();
    });

    test('last role finishing clears both queues (night results deferred to the next call)', async () => {
        const game = makeGame({
            gameStateProcessQueue: [GAME_ROLES.DOCTOR],
            gameStateParamQueue: [],
        });
        (getGame as jest.Mock).mockResolvedValue(game);

        await performNightAction(GAME_ID);

        expect(mockUpdate).toHaveBeenCalledWith({
            gameStateProcessQueue: [],
            gameStateParamQueue: [],
        });
        expect(updatesWith('gameState')).toHaveLength(0);
        expect(setGameErrorState).not.toHaveBeenCalled();
    });

    test('fully empty queues end the night: GM story generated and state moves to NIGHT_RESULTS', async () => {
        const game = makeGame({
            gameStateProcessQueue: [],
            gameStateParamQueue: [],
        });
        (getGame as jest.Mock).mockResolvedValue(game);

        const result = await performNightAction(GAME_ID);

        // GM story agent was asked once and the night ends.
        expect(mockAskText).toHaveBeenCalledTimes(1);
        const endUpdate = updatesWith('gameState')[0];
        expect(endUpdate.gameState).toBe(GAME_STATES.NIGHT_RESULTS);
        expect(result.messages.length).toBeGreaterThan(0);
        expect(setGameErrorState).not.toHaveBeenCalled();
    });

    test('unknown/dead bot at the param queue head produces an error state', async () => {
        const game = makeGame({
            gameStateProcessQueue: [GAME_ROLES.WEREWOLF],
            gameStateParamQueue: ['Ghost'],
        });
        (getGame as jest.Mock).mockResolvedValue(game);

        const result = await performNightAction(GAME_ID);

        expectErrorState('Bot not found: Ghost');
        expect(result.game.errorState).toBeTruthy();
    });
});

// ---------------------------------------------------------------------------
// NIGHT: human player turn handling
// ---------------------------------------------------------------------------

describe('human player night turns', () => {
    test('human at the param queue head waits for UI input: no update, no agent call', async () => {
        const game = makeGame({
            humanPlayerRole: GAME_ROLES.DOCTOR,
            gameStateProcessQueue: [GAME_ROLES.DOCTOR],
            gameStateParamQueue: [HUMAN_NAME],
        });
        (getGame as jest.Mock).mockResolvedValue(game);

        const result = await performNightAction(GAME_ID);

        expect(result.game).toBe(game);
        expect(mockUpdate).not.toHaveBeenCalled();
        expect(AgentFactory.createAgent).not.toHaveBeenCalled();
        expect(setGameErrorState).not.toHaveBeenCalled();
    });

    test('human who dies earlier in the night is skipped: param queue advanced without UI wait', async () => {
        const game = makeGame({
            humanPlayerRole: GAME_ROLES.DOCTOR,
            gameStateProcessQueue: [GAME_ROLES.DOCTOR],
            gameStateParamQueue: [HUMAN_NAME, 'Doc'],
            nightResults: { [GAME_ROLES.WEREWOLF]: { target: HUMAN_NAME } },
        } as Partial<Game>);
        (getGame as jest.Mock).mockResolvedValue(game);

        await performNightAction(GAME_ID);

        expect(mockUpdate).toHaveBeenCalledWith({
            gameStateParamQueue: ['Doc'],
        });
        expect(setGameErrorState).not.toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// summarizePastDay: NEW_DAY_BOT_SUMMARIES -> NIGHT_IMPRESSION
// ---------------------------------------------------------------------------

describe('summarizePastDay: starting a new day', () => {
    // summarizePastDayImpl reads game state from the Firestore doc snapshot (not getGame),
    // so point the db doc's get() at the desired state for these tests.
    function withDocData(gameData: Game) {
        const get = jest.fn(async () => ({ exists: true, data: () => gameData }));
        const doc = jest.fn(() => ({ update: mockUpdate, get, collection: jest.fn() }));
        (db!.collection as jest.Mock).mockReturnValue({ doc });
    }

    test('empty summary queue increments the day and moves to NIGHT_IMPRESSION', async () => {
        withDocData(makeGame({
            gameState: GAME_STATES.NEW_DAY_BOT_SUMMARIES,
            gameStateProcessQueue: [],
            currentDay: 1,
        }));
        (getGame as jest.Mock).mockResolvedValue(
            makeGame({ gameState: GAME_STATES.NIGHT_IMPRESSION, currentDay: 2 })
        );

        await summarizePastDay(GAME_ID);

        const update = updatesWith('gameState')[0];
        expect(update.gameState).toBe(GAME_STATES.NIGHT_IMPRESSION);
        expect(update.currentDay).toBe(2);
        expect(update.gameStateProcessQueue).toEqual([]);
        expect(update.dayActivityCounter).toEqual({});
        // The "Day N begins" story is posted for the new day.
        expect(savedMessages().some(
            (m) => m.messageType === MessageType.GAME_STORY && m.day === 2
        )).toBe(true);
        expect(setGameErrorState).not.toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// selectDayResponders: NIGHT_IMPRESSION -> DAY_DISCUSSION
// ---------------------------------------------------------------------------

describe('selectDayResponders', () => {
    test('seeds a few random alive bots and transitions to DAY_DISCUSSION', async () => {
        const game = makeGame({ gameState: GAME_STATES.NIGHT_IMPRESSION, currentDay: 2 });
        (getGame as jest.Mock).mockResolvedValue(game);

        await selectDayResponders(GAME_ID);

        const update = updatesWith('gameState')[0];
        expect(update.gameState).toBe(GAME_STATES.DAY_DISCUSSION);
        // 3 alive bots; with Math.random pinned at 0.5 the count is 3 (all of them).
        expect(update.gameStateProcessQueue).toEqual(
            expect.arrayContaining(['Wolf', 'Doc', 'Vil'])
        );
        expect(update.gameStateProcessQueue.length).toBeGreaterThanOrEqual(2);
        // Selection is recorded as a hidden debug message.
        expect(savedMessages().some(
            (m) => m.messageType === MessageType.GM_BOT_SELECTION
        )).toBe(true);
        expect(setGameErrorState).not.toHaveBeenCalled();
    });

    test('is a no-op when not in NIGHT_IMPRESSION (tolerant of double-fire)', async () => {
        const game = makeGame({ gameState: GAME_STATES.DAY_DISCUSSION });
        (getGame as jest.Mock).mockResolvedValue(game);

        const result = await selectDayResponders(GAME_ID);

        expect(result.game).toBe(game);
        expect(mockUpdate).not.toHaveBeenCalled();
        expect(setGameErrorState).not.toHaveBeenCalled();
    });
});
