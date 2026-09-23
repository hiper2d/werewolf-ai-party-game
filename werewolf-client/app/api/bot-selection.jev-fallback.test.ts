import { BotResponseError, GAME_STATES } from '@/app/api/game-models';

const mockAsk = jest.fn();
const mockJevSelect = jest.fn();

jest.mock('@/app/ai/agent-factory', () => ({
    AgentFactory: { createAgent: () => ({ askWithZodSchema: mockAsk, gameId: '', userId: '' }) },
}));
jest.mock('@/app/api/game-actions', () => ({
    getGameMessages: jest.fn(async () => []),
    addMessageToChatAndSaveToDb: jest.fn(async (m: any) => m),
    consumeRetryHint: jest.fn(async () => null),
}));
jest.mock('@/app/api/cost-tracking', () => ({ recordGameMasterTokenUsage: jest.fn() }));
jest.mock('@/app/utils/bot-utils', () => ({ getEffectiveModel: () => ({ aiType: 'm', enableThinking: false }) }));
jest.mock('@/app/utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock('@/app/ai/jev-client', () => ({ getJevApiKey: () => 'jev-key' }));
jest.mock('@/app/api/jev-router', () => {
    const { BotResponseError } = jest.requireActual('@/app/api/game-models');
    class JevRouterUnavailableError extends BotResponseError {}
    return { JevRouterUnavailableError, selectRespondingBotsWithJev: (...args: any[]) => mockJevSelect(...args) };
});

import { selectRespondingBots } from '@/app/api/bot-selection';
import { JevRouterUnavailableError } from '@/app/api/jev-router';

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

describe('Jev router falls back to the Game Master LLM router', () => {
    beforeEach(() => jest.clearAllMocks());

    it('uses the Jev selection when Jev answers', async () => {
        mockJevSelect.mockResolvedValue(['Bram']);
        expect(await selectRespondingBots(game, {}, 'u@e.com')).toEqual(['Bram']);
        expect(mockAsk).not.toHaveBeenCalled();
    });

    it('runs the GM router once when the Jev call fails (e.g. empty balance)', async () => {
        mockJevSelect.mockRejectedValue(new JevRouterUnavailableError('x', 'Jev returned HTTP 402', { gmAiType: 'jev' }, true));
        mockAsk.mockResolvedValue([{ selected_bots: ['Alice'] }, '', undefined, undefined]);
        const selected = await selectRespondingBots(game, {}, 'u@e.com');
        expect(selected).toContain('Alice');
        expect(mockJevSelect).toHaveBeenCalledTimes(1);
        expect(mockAsk).toHaveBeenCalledTimes(1);
        const { logger } = jest.requireMock('@/app/utils/logger');
        expect(logger.warn).toHaveBeenCalledWith(
            'Jev router unavailable, falling back to Game Master LLM router',
            expect.objectContaining({ gameId: 'g1', activity: 'jev_router', error: 'Jev returned HTTP 402' })
        );
    });

    it('does not fall back on other errors (e.g. the free-tier spend cap)', async () => {
        const capError = new BotResponseError('Daily limit reached', 'cap');
        mockJevSelect.mockRejectedValue(capError);
        await expect(selectRespondingBots(game, {}, 'u@e.com')).rejects.toBe(capError);
        expect(mockAsk).not.toHaveBeenCalled();
    });
});
