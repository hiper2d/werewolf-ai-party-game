/**
 * Unit tests for the vote tallying / elimination flow in app/api/bot-actions.ts:
 * bot vote accumulation, human vote accumulation, and the VOTE -> VOTE_RESULTS
 * empty-queue block (tally parse, elimination application, GAME_OVER paths).
 *
 * Queue mechanics (init, idempotency, state guards, human-at-head routing) are
 * covered by bot-actions.queues.test.ts — not duplicated here. The tie-break
 * rules themselves are covered by vote-utils.test.ts.
 *
 * These tests pin CURRENT behavior. All Firestore / auth / AI calls are mocked;
 * Math.random and Date.now are pinned for determinism.
 */

import { vote, humanPlayerVote } from './bot-actions';
import { db } from '@/firebase/server';
import { auth } from '@/auth';
import { AgentFactory } from '@/app/ai/agent-factory';
import {
    Bot,
    GAME_MASTER,
    GAME_ROLES,
    GAME_STATES,
    Game,
    MessageType,
    RECIPIENT_ALL,
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
        specialRoles: [],
        gameMasterAiType: 'mock-gm-model',
        gameMasterVoice: 'gm-voice',
        story: 'story',
        bots: [
            makeBot('Alice'),
            makeBot('Bob'),
            makeBot('Wolf', { role: GAME_ROLES.WEREWOLF }),
        ],
        humanPlayerName: HUMAN_NAME,
        humanPlayerRole: GAME_ROLES.VILLAGER,
        currentDay: 1,
        gameState: GAME_STATES.VOTE,
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
    (AgentFactory.createAgent as jest.Mock).mockReturnValue({
        askWithZodSchema: mockAskWithZodSchema,
        gameId: '',
        userId: '',
    });
});

afterEach(() => {
    jest.restoreAllMocks();
});

/** Agent resolves a bot vote {who, why}. */
function botVotes(who: string, why = 'suspicious') {
    mockAskWithZodSchema.mockResolvedValue([{ who, why }, 'thinking', undefined, undefined]);
}

// ---------------------------------------------------------------------------
// Bot vote accumulation (VOTE state, bot at queue head)
// ---------------------------------------------------------------------------

describe('vote: bot vote accumulation', () => {
    test('first vote initializes the tally and individual-vote record in the param queue', async () => {
        const game = makeGame({ gameStateProcessQueue: ['Alice', 'Bob', HUMAN_NAME] });
        (getGame as jest.Mock).mockResolvedValue(game);
        botVotes('Bob', 'too quiet');

        const result = await vote(GAME_ID);

        expect(mockUpdate).toHaveBeenCalledWith({
            gameStateProcessQueue: ['Bob', HUMAN_NAME],
            gameStateParamQueue: [
                JSON.stringify({ Bob: 1 }),
                JSON.stringify([{ voter: 'Alice', target: 'Bob', reason: 'too quiet', order: 1 }]),
            ],
        });

        // GM voting command + the bot's VOTE_MESSAGE are saved and returned.
        expect(savedMessages()[0]).toMatchObject({
            authorName: GAME_MASTER,
            recipientName: 'Alice',
            messageType: MessageType.GM_COMMAND,
        });
        expect(savedMessages()[1]).toMatchObject({
            authorName: 'Alice',
            recipientName: RECIPIENT_ALL,
            messageType: MessageType.VOTE_MESSAGE,
            msg: expect.objectContaining({ who: 'Bob', why: 'too quiet' }),
        });
        expect(result.messages).toHaveLength(2);
        expect(setGameErrorState).not.toHaveBeenCalled();
    });

    test('subsequent vote accumulates counts and appends to the individual votes with order', async () => {
        const existingVotes = [{ voter: 'Alice', target: 'Bob', reason: 'r1', order: 1 }];
        const game = makeGame({
            gameStateProcessQueue: ['Wolf', HUMAN_NAME],
            gameStateParamQueue: [JSON.stringify({ Bob: 1 }), JSON.stringify(existingVotes)],
        });
        (getGame as jest.Mock).mockResolvedValue(game);
        botVotes('Bob', 'finishing him');

        await vote(GAME_ID);

        expect(mockUpdate).toHaveBeenCalledWith({
            gameStateProcessQueue: [HUMAN_NAME],
            gameStateParamQueue: [
                JSON.stringify({ Bob: 2 }),
                JSON.stringify([
                    ...existingVotes,
                    { voter: 'Wolf', target: 'Bob', reason: 'finishing him', order: 2 },
                ]),
            ],
        });
    });

    test('malformed tally JSON in the param queue surfaces an error state instead of discarding votes', async () => {
        const game = makeGame({
            gameStateProcessQueue: ['Alice'],
            gameStateParamQueue: ['{not json', '[broken'],
        });
        (getGame as jest.Mock).mockResolvedValue(game);
        botVotes('Bob');

        const result = await vote(GAME_ID);

        // A corrupt tally is surfaced rather than silently reset to an empty tally.
        expectErrorState('Corrupted vote tally');
        expect(result.game.errorState).toBeTruthy();
        expect(updatesWith('gameStateProcessQueue')).toHaveLength(0);
    });

    test('vote for a dead or unknown target produces an error state and does not advance the queue', async () => {
        const game = makeGame({
            bots: [makeBot('Alice'), makeBot('Dead', { isAlive: false })],
            gameStateProcessQueue: ['Alice'],
        });
        (getGame as jest.Mock).mockResolvedValue(game);
        botVotes('Dead');

        const result = await vote(GAME_ID);

        expectErrorState('Invalid vote target: Dead');
        expect(result.game.errorState).toBeTruthy();
        expect(updatesWith('gameStateProcessQueue')).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------------
// Human vote accumulation (humanPlayerVote)
// ---------------------------------------------------------------------------

describe('humanPlayerVote: accumulation and guards', () => {
    test('human vote accumulates and removes the human from the queue', async () => {
        const game = makeGame({
            gameStateProcessQueue: [HUMAN_NAME],
            gameStateParamQueue: [
                JSON.stringify({ Wolf: 1 }),
                JSON.stringify([{ voter: 'Alice', target: 'Wolf', reason: 'r', order: 1 }]),
            ],
        });
        (getGame as jest.Mock).mockResolvedValue(game);

        const result = await humanPlayerVote(GAME_ID, 'Wolf', 'I saw fangs');

        expect(mockUpdate).toHaveBeenCalledWith({
            gameStateProcessQueue: [],
            gameStateParamQueue: [
                JSON.stringify({ Wolf: 2 }),
                JSON.stringify([
                    { voter: 'Alice', target: 'Wolf', reason: 'r', order: 1 },
                    { voter: HUMAN_NAME, target: 'Wolf', reason: 'I saw fangs', order: 2 },
                ]),
            ],
        });
        expect(savedMessages()[0]).toMatchObject({
            authorName: HUMAN_NAME,
            messageType: MessageType.VOTE_MESSAGE,
            msg: { who: 'Wolf', why: 'I saw fangs' },
        });
        // The returned game's param queue echoes BOTH blobs exactly as persisted.
        expect(result.game.gameStateParamQueue).toEqual([
            JSON.stringify({ Wolf: 2 }),
            JSON.stringify([
                { voter: 'Alice', target: 'Wolf', reason: 'r', order: 1 },
                { voter: HUMAN_NAME, target: 'Wolf', reason: 'I saw fangs', order: 2 },
            ]),
        ]);
        expect(setGameErrorState).not.toHaveBeenCalled();
    });

    test('rejected when it is not the human player turn', async () => {
        const game = makeGame({ gameStateProcessQueue: ['Alice', HUMAN_NAME] });
        (getGame as jest.Mock).mockResolvedValue(game);

        const result = await humanPlayerVote(GAME_ID, 'Alice', 'r');

        expectErrorState('Not your turn to vote');
        expect(result.game.errorState).toBeTruthy();
        expect(mockUpdate).not.toHaveBeenCalled();
    });

    test('rejected for a dead target', async () => {
        const game = makeGame({
            bots: [makeBot('Alice'), makeBot('Dead', { isAlive: false })],
            gameStateProcessQueue: [HUMAN_NAME],
        });
        (getGame as jest.Mock).mockResolvedValue(game);

        await humanPlayerVote(GAME_ID, 'Dead', 'r');

        expectErrorState('Invalid target player');
        expect(mockUpdate).not.toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// VOTE_RESULTS: tally parse + elimination (empty queue in VOTE state)
// ---------------------------------------------------------------------------

describe('vote: VOTE_RESULTS transition and elimination', () => {
    /**
     * Drives the empty-queue branch: first getGame returns the drained VOTE game,
     * subsequent reads return the same content (the code re-reads after the state
     * update and once more at the end).
     */
    function setupDrainedVote(paramQueue: string[], bots?: Bot[]) {
        const game = makeGame({
            gameState: GAME_STATES.VOTE,
            gameStateProcessQueue: [],
            gameStateParamQueue: paramQueue,
            ...(bots ? { bots } : {}),
        });
        (getGame as jest.Mock).mockResolvedValue(game);
        return game;
    }

    test('bot with most votes is eliminated: isAlive=false, eliminationDay set, votingHistory appended', async () => {
        const individual = [
            { voter: 'Alice', target: 'Bob', reason: 'r1', order: 1 },
            { voter: 'Wolf', target: 'Bob', reason: 'r2', order: 2 },
            { voter: 'Bob', target: 'Alice', reason: 'r3', order: 3 },
        ];
        setupDrainedVote([JSON.stringify({ Bob: 2, Alice: 1 }), JSON.stringify(individual)]);

        const result = await vote(GAME_ID);

        // 1) State moves to VOTE_RESULTS first.
        expect(mockUpdate.mock.calls[0][0]).toEqual({ gameState: GAME_STATES.VOTE_RESULTS });

        // 2) Elimination applied to the bots array + voting history recorded.
        const botsUpdate = updatesWith('bots')[0];
        const eliminatedBob = botsUpdate.bots.find((b: Bot) => b.name === 'Bob');
        expect(eliminatedBob).toMatchObject({ isAlive: false, eliminationDay: 1 });
        expect(botsUpdate.bots.filter((b: Bot) => !b.isAlive)).toHaveLength(1);
        expect(botsUpdate.votingHistory).toEqual([
            {
                day: 1,
                voteCounts: { Bob: 2, Alice: 1 },
                votes: individual,
                eliminatedPlayer: 'Bob',
                eliminatedPlayerRole: GAME_ROLES.VILLAGER,
            },
        ]);

        // 3) Results + elimination GM stories saved and returned.
        const stories = savedMessages().filter((m) => m.messageType === MessageType.GAME_STORY);
        expect(stories).toHaveLength(2);
        expect(result.messages).toHaveLength(2);

        // Eliminating a villager does not end a game that still has a live wolf.
        expect(updatesWith('gameState')).toEqual([{ gameState: GAME_STATES.VOTE_RESULTS }]);
        expect(setGameErrorState).not.toHaveBeenCalled();
    });

    test('human player eliminated by outright majority: GAME_OVER, bots untouched', async () => {
        setupDrainedVote([
            JSON.stringify({ [HUMAN_NAME]: 2, Alice: 1 }),
            JSON.stringify([]),
        ]);

        await vote(GAME_ID);

        expect(mockUpdate.mock.calls[0][0]).toEqual({ gameState: GAME_STATES.VOTE_RESULTS });
        expect(mockUpdate).toHaveBeenCalledWith({
            gameState: GAME_STATES.GAME_OVER,
            humanPlayerIsAlive: false,
            votingHistory: [
                expect.objectContaining({
                    eliminatedPlayer: HUMAN_NAME,
                    eliminatedPlayerRole: GAME_ROLES.VILLAGER, // humanPlayerRole
                }),
            ],
        });
        expect(updatesWith('bots')).toHaveLength(0);
        expect(setGameErrorState).not.toHaveBeenCalled();
    });

    test('eliminating the last werewolf triggers the villagers-win game end (extra GAME_OVER update + story)', async () => {
        setupDrainedVote([JSON.stringify({ Wolf: 3 }), JSON.stringify([])]);

        const result = await vote(GAME_ID);

        const botsUpdate = updatesWith('bots')[0];
        expect(botsUpdate.bots.find((b: Bot) => b.name === 'Wolf')).toMatchObject({
            isAlive: false,
        });
        expect(botsUpdate.votingHistory[0]).toMatchObject({
            eliminatedPlayer: 'Wolf',
            eliminatedPlayerRole: GAME_ROLES.WEREWOLF,
        });

        // Game-end check fires on the post-elimination roster.
        expect(mockUpdate).toHaveBeenCalledWith({ gameState: GAME_STATES.GAME_OVER });
        // Results + elimination + game-end stories.
        const stories = savedMessages().filter((m) => m.messageType === MessageType.GAME_STORY);
        expect(stories).toHaveLength(3);
        expect(result.messages).toHaveLength(3);
        expect(setGameErrorState).not.toHaveBeenCalled();
    });

    test('no votes recorded: transitions to VOTE_RESULTS with a results story but no elimination', async () => {
        setupDrainedVote([]);

        const result = await vote(GAME_ID);

        expect(mockUpdate).toHaveBeenCalledTimes(1);
        expect(mockUpdate).toHaveBeenCalledWith({ gameState: GAME_STATES.VOTE_RESULTS });
        expect(savedMessages()).toHaveLength(1);
        expect(result.messages).toHaveLength(1);
        expect(setGameErrorState).not.toHaveBeenCalled();
    });

    test('unparseable tally JSON surfaces an error state before transitioning to VOTE_RESULTS', async () => {
        setupDrainedVote(['{definitely not json']);

        const result = await vote(GAME_ID);

        // The corrupt tally is caught before any state change — no VOTE_RESULTS
        // transition, no elimination, just a visible error.
        expectErrorState('Corrupted vote tally');
        expect(result.game.errorState).toBeTruthy();
        expect(mockUpdate).not.toHaveBeenCalled();
    });
});
