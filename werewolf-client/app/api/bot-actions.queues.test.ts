/**
 * Unit tests for the game state-machine / queue handling in app/api/bot-actions.ts.
 *
 * Scope: welcome/discussion flow queue mechanics (gameStateProcessQueue /
 * gameStateParamQueue), GM bot-selection validation, idempotency guards and the
 * DAY_DISCUSSION -> VOTE entry transition.
 *
 * Explicitly OUT of scope (covered elsewhere, concurrently being edited):
 * vote tallying, tie-breaking and elimination (voteImpl Mode 2 with empty queue).
 *
 * These tests pin CURRENT behavior. All Firestore / auth / AI calls are mocked;
 * Math.random and Date.now are pinned for determinism.
 */

import { welcome, talkToAll, keepBotsGoing, manualSelectBots, vote } from './bot-actions';
import { db } from '@/firebase/server';
import { auth } from '@/auth';
import { AgentFactory } from '@/app/ai/agent-factory';
import {
    BOT_SELECTION_CONFIG,
    Bot,
    GAME_MASTER,
    GAME_ROLES,
    GAME_STATES,
    Game,
    MessageType,
    RECIPIENT_NONE,
} from '@/app/api/game-models';

// ---------------------------------------------------------------------------
// Mocks
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

// Same resolved module as './game-actions' (moduleNameMapper maps @/ to rootDir),
// so this also covers the server-action-wrapper's imports of getGame/setGameErrorState.
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

// Keep tests quiet and avoid the Better Stack transport (initialized at import time).
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
    getGameMessages,
    setGameErrorState,
} from '@/app/api/game-actions';
import { getApiKeysForUser } from '@/app/utils/tier-utils';

// ---------------------------------------------------------------------------
// Test fixtures and helpers
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
        playStyle: 'unknown-style', // falls back to the default play style description
        ...overrides,
    };
}

function makeGame(overrides: Partial<Game> = {}): Game {
    return {
        id: GAME_ID,
        description: 'desc',
        theme: 'theme',
        werewolfCount: 1,
        specialRoles: [],
        gameMasterAiType: 'mock-gm-model',
        gameMasterVoice: 'gm-voice',
        story: 'story',
        bots: [
            makeBot('Alice'),
            makeBot('Bob'),
            makeBot('Dead', { isAlive: false, eliminationDay: 1 }),
        ],
        humanPlayerName: HUMAN_NAME,
        humanPlayerRole: GAME_ROLES.VILLAGER,
        currentDay: 1,
        gameState: GAME_STATES.DAY_DISCUSSION,
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
// Game returned by db.collection('games').doc(id).get() (used by the
// day-activity-counter helpers, which read the doc directly).
let dbDocGame: Game;

/** All update() calls that touched the given field. */
function updatesWith(field: string): any[] {
    return mockUpdate.mock.calls
        .map(([arg]) => arg)
        .filter((arg) => arg && Object.prototype.hasOwnProperty.call(arg, field));
}

function expectErrorState(messagePart: string) {
    expect(setGameErrorState).toHaveBeenCalledWith(
        GAME_ID,
        expect.objectContaining({ error: expect.stringContaining(messagePart) })
    );
}

beforeEach(() => {
    jest.clearAllMocks();

    jest.spyOn(Math, 'random').mockReturnValue(0.5); // shuffle comparator -> 0 -> stable order
    jest.spyOn(Date, 'now').mockReturnValue(FIXED_NOW);

    (auth as jest.Mock).mockResolvedValue({ user: { email: USER_EMAIL } });
    (getApiKeysForUser as jest.Mock).mockResolvedValue({});
    (getGameMessages as jest.Mock).mockResolvedValue([]);
    (getBotMessages as jest.Mock).mockResolvedValue([]);
    (addMessageToChatAndSaveToDb as jest.Mock).mockImplementation(
        async (message: any) => ({ ...message, id: 'saved-msg-id' })
    );
    (setGameErrorState as jest.Mock).mockImplementation(async (gameId: string, errorState: any) => ({
        ...makeGame(),
        errorState,
    }));

    // Firestore db.collection('games').doc(id) chain
    mockUpdate = jest.fn().mockResolvedValue(undefined);
    dbDocGame = makeGame();
    const mockDoc = jest.fn(() => ({
        update: mockUpdate,
        get: jest.fn(async () => ({ exists: true, data: () => dbDocGame })),
        collection: jest.fn(),
    }));
    (db!.collection as jest.Mock).mockReturnValue({ doc: mockDoc });

    // Stub agent: every created agent shares one askWithZodSchema/askText mock pair.
    mockAskWithZodSchema = jest.fn();
    mockAskText = jest.fn();
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

/** Convenience: agent resolves a bot discussion/welcome answer. */
function agentRepliesWith(reply: string) {
    mockAskText.mockResolvedValue([reply, 'some thinking', undefined, undefined]);
}

/** Convenience: GM agent resolves a bot-selection answer. */
function gmSelects(selectedBots: string[], reasoning = 'because') {
    mockAskWithZodSchema.mockResolvedValue([
        { selected_bots: selectedBots, reasoning },
        '',
        undefined,
        undefined,
    ]);
}

// ---------------------------------------------------------------------------
// welcome: gameStateParamQueue mechanics
// ---------------------------------------------------------------------------

describe('welcome (WELCOME state, gameStateParamQueue)', () => {
    test('empty param queue transitions to DAY_DISCUSSION and clears the process queue', async () => {
        const game = makeGame({ gameState: GAME_STATES.WELCOME, gameStateParamQueue: [] });
        (getGame as jest.Mock).mockResolvedValue(game);

        await welcome(GAME_ID);

        expect(mockUpdate).toHaveBeenCalledWith({
            gameState: GAME_STATES.DAY_DISCUSSION,
            gameStateProcessQueue: [],
        });
        expect(AgentFactory.createAgent).not.toHaveBeenCalled();
        expect(setGameErrorState).not.toHaveBeenCalled();
    });

    test('processes exactly the queue head and advances the queue by one', async () => {
        const game = makeGame({
            gameState: GAME_STATES.WELCOME,
            gameStateParamQueue: ['Alice', 'Bob'],
        });
        (getGame as jest.Mock).mockResolvedValue(game);
        dbDocGame = game;
        agentRepliesWith('Hello, I am Alice');

        const result = await welcome(GAME_ID);

        // Only Alice's agent was created and asked once.
        expect(AgentFactory.createAgent).toHaveBeenCalledTimes(1);
        expect((AgentFactory.createAgent as jest.Mock).mock.calls[0][0]).toBe('Alice');
        expect(mockAskText).toHaveBeenCalledTimes(1);

        // Queue advanced by exactly one; game stays in WELCOME (no gameState in update).
        expect(mockUpdate).toHaveBeenCalledWith({ gameStateParamQueue: ['Bob'] });
        expect(updatesWith('gameState')).toHaveLength(0);

        // GM command saved first, then Alice's BOT_WELCOME answer.
        const savedMessages = (addMessageToChatAndSaveToDb as jest.Mock).mock.calls.map(([m]) => m);
        expect(savedMessages[0]).toMatchObject({
            authorName: GAME_MASTER,
            recipientName: 'Alice',
            messageType: MessageType.GM_COMMAND,
        });
        expect(savedMessages[1]).toMatchObject({
            authorName: 'Alice',
            messageType: MessageType.BOT_WELCOME,
            msg: expect.objectContaining({ reply: 'Hello, I am Alice' }),
        });
        expect(result.messages).toHaveLength(2);
        expect(setGameErrorState).not.toHaveBeenCalled();
    });

    test('after the last bot introduces itself, transitions to DAY_DISCUSSION with empty queues', async () => {
        const game = makeGame({
            gameState: GAME_STATES.WELCOME,
            gameStateParamQueue: ['Bob'],
        });
        (getGame as jest.Mock).mockResolvedValue(game);
        dbDocGame = game;
        agentRepliesWith('Hi, Bob here');

        await welcome(GAME_ID);

        expect(mockUpdate).toHaveBeenCalledWith({
            gameStateParamQueue: [],
            gameState: GAME_STATES.DAY_DISCUSSION,
            gameStateProcessQueue: [],
        });
    });

    test('unknown bot name at queue head puts the game into error state (error swallowed by wrapper)', async () => {
        const game = makeGame({
            gameState: GAME_STATES.WELCOME,
            gameStateParamQueue: ['Ghost', 'Alice'],
        });
        (getGame as jest.Mock).mockResolvedValue(game);

        const result = await welcome(GAME_ID);

        expectErrorState('Bot Ghost not found in game');
        expect(AgentFactory.createAgent).not.toHaveBeenCalled();
        // Queue is NOT advanced past the broken entry (pinned behavior).
        expect(updatesWith('gameStateParamQueue')).toHaveLength(0);
        // Wrapper converts the throw into a returned error-state game.
        expect(result.game.errorState).toBeTruthy();
        expect(result.messages).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// talkToAll: gameStateProcessQueue mechanics
// ---------------------------------------------------------------------------

describe('talkToAll (DAY_DISCUSSION, processing the bot queue)', () => {
    test('processes the queue head and removes exactly that bot from the queue', async () => {
        const game = makeGame({ gameStateProcessQueue: ['Alice', 'Bob'] });
        (getGame as jest.Mock).mockResolvedValue(game);
        dbDocGame = game;
        agentRepliesWith('Alice discussion reply');

        const result = await talkToAll(GAME_ID, '');

        expect(AgentFactory.createAgent).toHaveBeenCalledTimes(1);
        expect((AgentFactory.createAgent as jest.Mock).mock.calls[0][0]).toBe('Alice');
        expect(mockUpdate).toHaveBeenCalledWith({ gameStateProcessQueue: ['Bob'] });

        const savedMessages = (addMessageToChatAndSaveToDb as jest.Mock).mock.calls.map(([m]) => m);
        expect(savedMessages[0]).toMatchObject({
            authorName: GAME_MASTER,
            recipientName: 'Alice',
            messageType: MessageType.GM_COMMAND,
        });
        expect(savedMessages[1]).toMatchObject({
            authorName: 'Alice',
            messageType: MessageType.BOT_ANSWER,
            msg: expect.objectContaining({ reply: 'Alice discussion reply' }),
        });
        expect(result.messages).toHaveLength(2);
        expect(setGameErrorState).not.toHaveBeenCalled();
    });

    test('human player at queue head is skipped without invoking any agent', async () => {
        const game = makeGame({ gameStateProcessQueue: [HUMAN_NAME, 'Alice'] });
        (getGame as jest.Mock).mockResolvedValue(game);

        const result = await talkToAll(GAME_ID, '');

        expect(AgentFactory.createAgent).not.toHaveBeenCalled();
        expect(mockUpdate).toHaveBeenCalledWith({ gameStateProcessQueue: ['Alice'] });
        expect(result.messages).toEqual([]);
        expect(setGameErrorState).not.toHaveBeenCalled();
    });

    test('does not overwrite the queue when it was cleared mid-processing (cancellation guard)', async () => {
        const initial = makeGame({ gameStateProcessQueue: ['Alice', 'Bob'] });
        const cleared = makeGame({ gameStateProcessQueue: [] });
        (getGame as jest.Mock)
            .mockResolvedValueOnce(initial) // talkToAll initial read
            .mockResolvedValueOnce(cleared) // fresh re-read in processNextBotInQueue
            .mockResolvedValue(cleared); // subsequent reads
        dbDocGame = initial;
        agentRepliesWith('Alice reply');

        await talkToAll(GAME_ID, '');

        // Bot was processed (messages saved), but the cleared queue was NOT overwritten.
        expect(mockAskText).toHaveBeenCalledTimes(1);
        expect(updatesWith('gameStateProcessQueue')).toHaveLength(0);
        expect(setGameErrorState).not.toHaveBeenCalled();
    });

    test('DAY_DISCUSSION -> VOTE auto-transition when message threshold reached and queue drains', async () => {
        // 2 alive bots + human => threshold = 3 * 3.5 = 10.5; counter sums to 11.
        const highActivity = { Alice: 6, Bob: 5 };
        const processing = makeGame({
            gameStateProcessQueue: ['Alice'],
            dayActivityCounter: highActivity,
        });
        const drained = makeGame({
            gameStateProcessQueue: [],
            dayActivityCounter: highActivity,
        });
        (getGame as jest.Mock)
            .mockResolvedValueOnce(processing) // initial read
            .mockResolvedValueOnce(processing) // fresh re-read (queue still non-empty -> update)
            .mockResolvedValue(drained); // updated game seen by shouldTriggerAutoVote
        dbDocGame = processing;
        agentRepliesWith('Alice reply');

        await talkToAll(GAME_ID, '');

        // With Math.random pinned to 0.5 the shuffle is a no-op: alive bots then human.
        expect(mockUpdate).toHaveBeenCalledWith({
            gameState: GAME_STATES.VOTE,
            gameStateProcessQueue: ['Alice', 'Bob', HUMAN_NAME],
            gameStateParamQueue: [],
        });
        expect(setGameErrorState).not.toHaveBeenCalled();
    });

    test('no VOTE transition when the queue drains but the threshold is not reached', async () => {
        const game = makeGame({
            gameStateProcessQueue: ['Alice'],
            dayActivityCounter: { Alice: 1 },
        });
        const drained = makeGame({ gameStateProcessQueue: [], dayActivityCounter: { Alice: 2 } });
        (getGame as jest.Mock)
            .mockResolvedValueOnce(game)
            .mockResolvedValueOnce(game)
            .mockResolvedValue(drained);
        dbDocGame = game;
        agentRepliesWith('Alice reply');

        await talkToAll(GAME_ID, '');

        expect(updatesWith('gameState')).toHaveLength(0);
    });

    test('rejects when game is not in DAY_DISCUSSION or AFTER_GAME_DISCUSSION', async () => {
        const game = makeGame({ gameState: GAME_STATES.VOTE, gameStateProcessQueue: ['Alice'] });
        (getGame as jest.Mock).mockResolvedValue(game);

        const result = await talkToAll(GAME_ID, '');

        expectErrorState('Game is not in DAY_DISCUSSION or AFTER_GAME_DISCUSSION state');
        expect(result.game.errorState).toBeTruthy();
        expect(mockUpdate).not.toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// GM bot selection (talkToAll with a human message, empty queue)
// ---------------------------------------------------------------------------

describe('GM bot selection via talkToAll (human message, empty queue)', () => {
    test('valid GM selection populates the process queue and saves hidden selection message', async () => {
        const game = makeGame();
        (getGame as jest.Mock).mockResolvedValue(game);
        dbDocGame = game;
        gmSelects(['Alice', 'Bob'], 'they are relevant');

        const result = await talkToAll(GAME_ID, 'Hello bots');

        expect(mockUpdate).toHaveBeenCalledWith({ gameStateProcessQueue: ['Alice', 'Bob'] });

        const savedMessages = (addMessageToChatAndSaveToDb as jest.Mock).mock.calls.map(([m]) => m);
        // Human message saved first, then the hidden GM selection debug message.
        expect(savedMessages[0]).toMatchObject({
            authorName: HUMAN_NAME,
            messageType: MessageType.HUMAN_PLAYER_MESSAGE,
            msg: 'Hello bots',
        });
        expect(savedMessages[1]).toMatchObject({
            authorName: GAME_MASTER,
            recipientName: RECIPIENT_NONE,
            messageType: MessageType.GM_BOT_SELECTION,
        });
        // Only the human message is returned to the UI.
        expect(result.messages).toHaveLength(1);
        expect(result.messages[0].messageType).toBe(MessageType.HUMAN_PLAYER_MESSAGE);
        expect(setGameErrorState).not.toHaveBeenCalled();
    });

    test('GM selecting a dead bot drops it and tops the selection up to MIN (no error)', async () => {
        const game = makeGame();
        (getGame as jest.Mock).mockResolvedValue(game);
        dbDocGame = game;
        gmSelects(['Dead']);

        await talkToAll(GAME_ID, 'Hello bots');

        // 'Dead' is clamped out; the selection is topped up to MIN with an alive bot.
        expect(setGameErrorState).not.toHaveBeenCalled();
        const queues = updatesWith('gameStateProcessQueue');
        expect(queues).toHaveLength(1);
        const queue = queues[0].gameStateProcessQueue;
        expect(queue.length).toBe(BOT_SELECTION_CONFIG.MIN);
        expect(queue).not.toContain('Dead');
        expect(['Alice', 'Bob']).toEqual(expect.arrayContaining(queue));
        // The human message is persisted regardless.
        const savedMessages = (addMessageToChatAndSaveToDb as jest.Mock).mock.calls.map(([m]) => m);
        expect(savedMessages[0]).toMatchObject({ messageType: MessageType.HUMAN_PLAYER_MESSAGE });
    });

    test('GM selecting the human player drops it and tops up to MIN (no error)', async () => {
        const game = makeGame();
        (getGame as jest.Mock).mockResolvedValue(game);
        dbDocGame = game;
        gmSelects([HUMAN_NAME]);

        await talkToAll(GAME_ID, 'Hello bots');

        expect(setGameErrorState).not.toHaveBeenCalled();
        const queue = updatesWith('gameStateProcessQueue')[0].gameStateProcessQueue;
        expect(queue.length).toBe(BOT_SELECTION_CONFIG.MIN);
        expect(queue).not.toContain(HUMAN_NAME);
    });

    test('GM selecting an unknown name drops it and tops up to MIN (no error)', async () => {
        const game = makeGame();
        (getGame as jest.Mock).mockResolvedValue(game);
        dbDocGame = game;
        gmSelects(['Nobody']);

        await talkToAll(GAME_ID, 'Hello bots');

        expect(setGameErrorState).not.toHaveBeenCalled();
        const queue = updatesWith('gameStateProcessQueue')[0].gameStateProcessQueue;
        expect(queue.length).toBe(BOT_SELECTION_CONFIG.MIN);
        expect(queue).not.toContain('Nobody');
    });

    test('a genuine GM selection failure still persists the human message', async () => {
        const game = makeGame();
        (getGame as jest.Mock).mockResolvedValue(game);
        dbDocGame = game;
        // GM returns no usable response — selectRespondingBots throws.
        mockAskWithZodSchema.mockResolvedValue([null, '', undefined, undefined]);

        const result = await talkToAll(GAME_ID, 'Hello bots');

        // The selection failed and surfaced as an error state...
        expect(result.game.errorState).toBeTruthy();
        // ...but the human's message was already saved (no retype required).
        const savedMessages = (addMessageToChatAndSaveToDb as jest.Mock).mock.calls.map(([m]) => m);
        expect(savedMessages[0]).toMatchObject({
            authorName: HUMAN_NAME,
            messageType: MessageType.HUMAN_PLAYER_MESSAGE,
            msg: 'Hello bots',
        });
        expect(updatesWith('gameStateProcessQueue')).toHaveLength(0);
    });

    test('GM selection larger than BOT_SELECTION_CONFIG.MAX is clamped to the first MAX names', async () => {
        const manyBots = ['B1', 'B2', 'B3', 'B4', 'B5', 'B6'].map((n) => makeBot(n));
        const game = makeGame({ bots: manyBots });
        (getGame as jest.Mock).mockResolvedValue(game);
        dbDocGame = game;
        gmSelects(['B1', 'B2', 'B3', 'B4', 'B5', 'B6']);

        await talkToAll(GAME_ID, 'Hello bots');

        expect(BOT_SELECTION_CONFIG.MAX).toBe(5);
        expect(mockUpdate).toHaveBeenCalledWith({
            gameStateProcessQueue: ['B1', 'B2', 'B3', 'B4', 'B5'],
        });
        expect(setGameErrorState).not.toHaveBeenCalled();
    });

    test('empty GM selection is topped up to MIN — never sets an empty queue', async () => {
        const game = makeGame();
        (getGame as jest.Mock).mockResolvedValue(game);
        dbDocGame = game;
        gmSelects([]);

        await talkToAll(GAME_ID, 'Hello bots');

        const queue = updatesWith('gameStateProcessQueue')[0].gameStateProcessQueue;
        expect(queue.length).toBe(BOT_SELECTION_CONFIG.MIN);
        expect(['Alice', 'Bob']).toEqual(expect.arrayContaining(queue));
        expect(setGameErrorState).not.toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// keepBotsGoing: GM selection without human input
// ---------------------------------------------------------------------------

describe('keepBotsGoing (DAY_DISCUSSION, empty queue)', () => {
    test('rejects when bots are already in the conversation queue', async () => {
        const game = makeGame({ gameStateProcessQueue: ['Alice'] });
        (getGame as jest.Mock).mockResolvedValue(game);

        const result = await keepBotsGoing(GAME_ID);

        expectErrorState('Bots are already in conversation queue');
        expect(result.game.errorState).toBeTruthy();
        expect(AgentFactory.createAgent).not.toHaveBeenCalled();
    });

    test('valid GM selection populates the process queue', async () => {
        const game = makeGame();
        (getGame as jest.Mock).mockResolvedValue(game);
        dbDocGame = game;
        gmSelects(['Bob', 'Alice']);

        await keepBotsGoing(GAME_ID);

        expect(mockUpdate).toHaveBeenCalledWith({ gameStateProcessQueue: ['Bob', 'Alice'] });

        const savedMessages = (addMessageToChatAndSaveToDb as jest.Mock).mock.calls.map(([m]) => m);
        expect(savedMessages[0]).toMatchObject({
            recipientName: RECIPIENT_NONE,
            messageType: MessageType.GM_BOT_SELECTION,
        });
        expect(setGameErrorState).not.toHaveBeenCalled();
    });

    test('GM selecting a dead bot drops it and tops up to MIN (no error)', async () => {
        const game = makeGame();
        (getGame as jest.Mock).mockResolvedValue(game);
        dbDocGame = game;
        gmSelects(['Dead']);

        await keepBotsGoing(GAME_ID);

        expect(setGameErrorState).not.toHaveBeenCalled();
        const queue = updatesWith('gameStateProcessQueue')[0].gameStateProcessQueue;
        expect(queue.length).toBe(BOT_SELECTION_CONFIG.MIN);
        expect(queue).not.toContain('Dead');
        expect(['Alice', 'Bob']).toEqual(expect.arrayContaining(queue));
    });

    test('transitions straight to VOTE (no GM call) when the message threshold is already reached', async () => {
        // 2 alive bots + human => threshold 10.5; counter sums to 12.
        const game = makeGame({ dayActivityCounter: { Alice: 6, Bob: 6 } });
        (getGame as jest.Mock).mockResolvedValue(game);

        await keepBotsGoing(GAME_ID);

        expect(AgentFactory.createAgent).not.toHaveBeenCalled();
        expect(mockUpdate).toHaveBeenCalledWith({
            gameState: GAME_STATES.VOTE,
            gameStateProcessQueue: ['Alice', 'Bob', HUMAN_NAME],
            gameStateParamQueue: [],
        });
    });
});

// ---------------------------------------------------------------------------
// manualSelectBots: human-driven selection validation
// ---------------------------------------------------------------------------

describe('manualSelectBots (selection validation)', () => {
    test('valid selection populates the process queue', async () => {
        const game = makeGame();
        (getGame as jest.Mock).mockResolvedValue(game);

        await manualSelectBots(GAME_ID, ['Bob']);

        expect(mockUpdate).toHaveBeenCalledWith({ gameStateProcessQueue: ['Bob'] });
        expect(setGameErrorState).not.toHaveBeenCalled();
    });

    test('selection below MIN is rejected', async () => {
        const game = makeGame();
        (getGame as jest.Mock).mockResolvedValue(game);

        await manualSelectBots(GAME_ID, []);

        expectErrorState(
            `Must select between ${BOT_SELECTION_CONFIG.MIN} and ${BOT_SELECTION_CONFIG.MAX} bots`
        );
        expect(updatesWith('gameStateProcessQueue')).toHaveLength(0);
    });

    test('selection above MAX is rejected', async () => {
        const manyBots = ['B1', 'B2', 'B3', 'B4', 'B5', 'B6'].map((n) => makeBot(n));
        const game = makeGame({ bots: manyBots });
        (getGame as jest.Mock).mockResolvedValue(game);

        await manualSelectBots(GAME_ID, ['B1', 'B2', 'B3', 'B4', 'B5', 'B6']);

        expectErrorState(
            `Must select between ${BOT_SELECTION_CONFIG.MIN} and ${BOT_SELECTION_CONFIG.MAX} bots`
        );
        expect(updatesWith('gameStateProcessQueue')).toHaveLength(0);
    });

    test('selecting the human player is rejected', async () => {
        const game = makeGame();
        (getGame as jest.Mock).mockResolvedValue(game);

        await manualSelectBots(GAME_ID, [HUMAN_NAME]);

        expectErrorState('Cannot select human player');
        expect(updatesWith('gameStateProcessQueue')).toHaveLength(0);
    });

    test('selecting a dead bot is rejected', async () => {
        const game = makeGame();
        (getGame as jest.Mock).mockResolvedValue(game);

        await manualSelectBots(GAME_ID, ['Dead']);

        expectErrorState('Invalid bot selection: Dead is not an alive bot');
        expect(updatesWith('gameStateProcessQueue')).toHaveLength(0);
    });

    test('rejected while other bots are still responding (non-empty queue)', async () => {
        const game = makeGame({ gameStateProcessQueue: ['Alice'] });
        (getGame as jest.Mock).mockResolvedValue(game);

        await manualSelectBots(GAME_ID, ['Bob']);

        expectErrorState('Cannot select bots while others are still responding');
    });
});

// ---------------------------------------------------------------------------
// vote: queue initialization and per-voter guards (NOT tallying/elimination)
// ---------------------------------------------------------------------------

describe('vote (queue mechanics only)', () => {
    test('DAY_DISCUSSION initializes VOTE with all alive players + human in the process queue', async () => {
        const game = makeGame({ gameState: GAME_STATES.DAY_DISCUSSION });
        (getGame as jest.Mock).mockResolvedValue(game);

        await vote(GAME_ID);

        // Math.random pinned to 0.5 -> shuffle preserves order: alive bots, then human.
        // Dead bots are excluded.
        expect(mockUpdate).toHaveBeenCalledWith({
            gameState: GAME_STATES.VOTE,
            gameStateProcessQueue: ['Alice', 'Bob', HUMAN_NAME],
            gameStateParamQueue: [],
        });
        expect(setGameErrorState).not.toHaveBeenCalled();
    });

    test('idempotency: voter no longer in the re-read queue is skipped without error', async () => {
        const initial = makeGame({
            gameState: GAME_STATES.VOTE,
            gameStateProcessQueue: ['Alice', 'Bob'],
        });
        // Re-read state: Alice already processed elsewhere.
        const reread = makeGame({
            gameState: GAME_STATES.VOTE,
            gameStateProcessQueue: ['Bob'],
        });
        (getGame as jest.Mock)
            .mockResolvedValueOnce(initial)
            .mockResolvedValue(reread);

        const result = await vote(GAME_ID);

        expect(AgentFactory.createAgent).not.toHaveBeenCalled();
        expect(mockUpdate).not.toHaveBeenCalled();
        expect(result.messages).toEqual([]);
        expect(result.game.gameStateProcessQueue).toEqual(['Bob']);
        expect(setGameErrorState).not.toHaveBeenCalled();
    });

    test('state-changed-mid-processing guard produces an error state', async () => {
        const initial = makeGame({
            gameState: GAME_STATES.VOTE,
            gameStateProcessQueue: ['Alice', 'Bob'],
        });
        // Re-read: Alice still queued but the state moved on.
        const reread = makeGame({
            gameState: GAME_STATES.DAY_DISCUSSION,
            gameStateProcessQueue: ['Alice', 'Bob'],
        });
        (getGame as jest.Mock)
            .mockResolvedValueOnce(initial)
            .mockResolvedValue(reread);

        const result = await vote(GAME_ID);

        expectErrorState('Game state changed during processing: DAY_DISCUSSION');
        expect(result.game.errorState).toBeTruthy();
        expect(AgentFactory.createAgent).not.toHaveBeenCalled();
    });

    test('human player at queue head returns to UI without touching the queue', async () => {
        const game = makeGame({
            gameState: GAME_STATES.VOTE,
            gameStateProcessQueue: [HUMAN_NAME, 'Alice'],
        });
        (getGame as jest.Mock).mockResolvedValue(game);

        const result = await vote(GAME_ID);

        expect(AgentFactory.createAgent).not.toHaveBeenCalled();
        expect(mockUpdate).not.toHaveBeenCalled();
        expect(result.messages).toEqual([]);
        expect(result.game.gameStateProcessQueue).toEqual([HUMAN_NAME, 'Alice']);
    });

    test('invalid game state for voting produces an error state', async () => {
        const game = makeGame({ gameState: GAME_STATES.NIGHT });
        (getGame as jest.Mock).mockResolvedValue(game);

        const result = await vote(GAME_ID);

        expectErrorState('Invalid game state for voting: NIGHT');
        expect(result.game.errorState).toBeTruthy();
    });
});
