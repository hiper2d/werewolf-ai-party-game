import { GAME_ROLES } from '@/app/api/game-models';

const mockAsk = jest.fn();

jest.mock('@/auth', () => ({ auth: jest.fn(async () => ({ user: { email: 'u@e.com' } })) }));
jest.mock('@/app/utils/tier-utils', () => ({ getApiKeysForUser: jest.fn(async () => ({})) }));
jest.mock('@/app/ai/agent-factory', () => ({
    AgentFactory: { createAgent: () => ({ askWithZodSchema: mockAsk, gameId: '', userId: '' }) },
}));
jest.mock('@/app/api/game-actions', () => ({
    addMessageToChatAndSaveToDb: jest.fn(async (m: any) => m),
    consumeRetryHint: jest.fn(async () => null),
    getBotMessages: jest.fn(async () => []),
}));
jest.mock('@/app/api/cost-tracking', () => ({ recordBotTokenUsage: jest.fn() }));

import { ManiacProcessor } from '@/app/api/roles/maniac-processor';

const game: any = {
    id: 'g1',
    currentDay: 4,
    gameState: 'NIGHT',
    gameMode: 'roleplay',
    humanPlayerName: 'Ajax',
    humanPlayerRole: 'villager',
    bots: [
        { name: 'Franky', role: GAME_ROLES.MANIAC, isAlive: true, aiType: 'm', story: '' },
        { name: 'Rex', role: 'werewolf', isAlive: true, aiType: 'm', story: '' },
        { name: 'Lila', role: 'villager', isAlive: true, aiType: 'm', story: '' },
    ],
    gameStateParamQueue: ['Franky'],
    gameStateProcessQueue: [],
    previousNightResults: { maniac: { target: 'Rex' } },
};

describe('maniac rejection keeps its retry explanation', () => {
    it('returns the repeat-target explanation so the night wrapper can hand it to Retry', async () => {
        // The 2026-09-25 case: thinking settled on Ajax, the target field still said last night's Rex.
        mockAsk.mockResolvedValue([{ target: 'Rex', reasoning: "Wait - I can't abduct Rex" }, '', undefined, undefined]);

        const result = await new ManiacProcessor('g1', game).processNightAction();

        expect(result.success).toBe(false);
        expect(result.error).toContain('cannot abduct same target');
        expect(result.explanation).toContain('Rex');
        expect(result.explanation).toContain('Lila');
    });
});
