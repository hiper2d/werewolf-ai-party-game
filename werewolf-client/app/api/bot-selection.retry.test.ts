import { BotResponseError, GAME_MASTER, GAME_STATES } from '@/app/api/game-models';

const mockAsk = jest.fn();
const mockConsumeRetryHint = jest.fn(async () => null as string | null);
const savedMessages: any[] = [];

jest.mock('@/app/ai/agent-factory', () => ({
    AgentFactory: { createAgent: () => ({ askWithZodSchema: mockAsk, gameId: '', userId: '' }) },
}));
jest.mock('@/app/api/game-actions', () => ({
    getGameMessages: jest.fn(async () => []),
    addMessageToChatAndSaveToDb: jest.fn(async (m: any) => { savedMessages.push(m); return m; }),
    consumeRetryHint: (...args: any[]) => mockConsumeRetryHint(...(args as [])),
}));
jest.mock('@/app/api/cost-tracking', () => ({ recordGameMasterTokenUsage: jest.fn() }));
jest.mock('@/app/utils/bot-utils', () => ({ getEffectiveModel: () => ({ aiType: 'm', enableThinking: false }) }));

import { selectRespondingBots } from '@/app/api/bot-selection';

const game: any = {
    id: 'g1',
    currentDay: 2,
    gameState: GAME_STATES.DAY_DISCUSSION,
    humanPlayerName: 'You',
    humanPlayerRole: 'villager',
    bots: [
        { name: 'Alice', role: 'villager', isAlive: true },
        { name: 'Bram', role: 'werewolf', isAlive: true },
    ],
    dayActivityCounter: {},
};

async function callAndCatch(): Promise<BotResponseError> {
    try {
        await selectRespondingBots(game, {}, 'u@e.com');
    } catch (e) {
        return e as BotResponseError;
    }
    throw new Error('expected selectRespondingBots to throw');
}

describe('router failure is recoverable by the UI', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        savedMessages.length = 0;
        mockConsumeRetryHint.mockResolvedValue(null);
    });

    it('tags an empty GM response so Retry can re-run the selection step', async () => {
        mockAsk.mockResolvedValue([null, '', undefined, undefined]);
        const err = await callAndCatch();
        // Without this tag the UI clears the error and stalls: the router throws before the
        // process queue is written, and the auto-processing effect is gated on a non-empty queue.
        expect(err.context.action).toBe('bot_selection');
        expect(err.recoverable).toBe(true);
    });

    it('tags a malformed GM response the same way', async () => {
        mockAsk.mockResolvedValue([{ selected_bots: 'not-an-array' }, '', undefined, undefined]);
        const err = await callAndCatch();
        expect(err.context.action).toBe('bot_selection');
    });

    it('carries a response-format explanation for the user-triggered retry', async () => {
        mockAsk.mockResolvedValue([null, '', undefined, undefined]);
        const err = await callAndCatch();
        expect(err.explanation).toContain('not valid JSON');
    });

    it('appends a consumed hint to the selection command, addressed to the GM', async () => {
        mockConsumeRetryHint.mockResolvedValue('**Your previous answer was rejected.** ...');
        mockAsk.mockResolvedValue([{ selected_bots: ['Alice'] }, '', undefined, undefined]);

        await selectRespondingBots(game, {}, 'u@e.com');

        expect(mockConsumeRetryHint).toHaveBeenCalledWith('g1', game, GAME_MASTER);
        const history = mockAsk.mock.calls[0][1];
        const prompt = history.map((m: any) => m.content).join('\n');
        expect(prompt).toContain('**Your previous answer was rejected.**');
    });

    it('sends no hint text on a first attempt', async () => {
        mockAsk.mockResolvedValue([{ selected_bots: ['Alice'] }, '', undefined, undefined]);
        await selectRespondingBots(game, {}, 'u@e.com');
        const history = mockAsk.mock.calls[0][1];
        const prompt = history.map((m: any) => m.content).join('\n');
        expect(prompt).not.toContain('previous answer was rejected');
    });

    it('makes exactly one AI call — no backend retry', async () => {
        mockAsk.mockResolvedValue([{ selected_bots: ['Alice'] }, '', undefined, undefined]);
        await selectRespondingBots(game, {}, 'u@e.com');
        expect(mockAsk).toHaveBeenCalledTimes(1);
    });
});
