import { isHiddenRoleRetry, retryModelPatch } from '@/app/api/retry-model';
import { GAME_MASTER, GAME_STATES, type Bot, type Game } from '@/app/api/game-models';

const bot = (name: string, aiType: string, extra: Partial<Bot> = {}): Bot =>
    ({ name, aiType, role: 'villager', isAlive: true, story: '', gender: 'female', voice: 'alloy', playStyle: '', ...extra }) as Bot;

const gameIn = (gameState: string): Pick<Game, 'gameState' | 'bots' | 'gameMasterAiType'> => ({
    gameState,
    gameMasterAiType: 'mistral-small',
    bots: [bot('Seraphine', 'qwen-max'), bot('Clotilde', 'gemini-argon', { enableThinking: true })],
});

describe('isHiddenRoleRetry', () => {
    it('is only a bot during NIGHT', () => {
        expect(isHiddenRoleRetry(GAME_STATES.NIGHT, 'doctor')).toBe(true);
        expect(isHiddenRoleRetry(GAME_STATES.NIGHT, 'Clotilde')).toBe(true);
        expect(isHiddenRoleRetry(GAME_STATES.NIGHT, GAME_MASTER)).toBe(false);
        expect(isHiddenRoleRetry(GAME_STATES.DAY_DISCUSSION, 'Clotilde')).toBe(false);
        expect(isHiddenRoleRetry(GAME_STATES.VOTE, 'Clotilde')).toBe(false);
        expect(isHiddenRoleRetry(GAME_STATES.WELCOME, 'Clotilde')).toBe(false);
    });
});

describe('retryModelPatch', () => {
    it('switches a bot permanently during the day and leaves the others alone', () => {
        // The 2026-10-14 Palace game: Clotilde on a blocked provider retried one-shot 12 times.
        const patch = retryModelPatch(gameIn(GAME_STATES.DAY_DISCUSSION), 'Clotilde', 'mistral-small');
        expect(patch.permanent).toBe(true);
        expect(patch.modelOverride).toBeNull();
        expect(patch.errorState).toBeNull();
        expect(patch.retryHint).toBeNull();
        expect(patch.gameMasterAiType).toBeUndefined();
        expect(patch.bots?.map(b => [b.name, b.aiType, b.enableThinking])).toEqual([
            ['Seraphine', 'qwen-max', undefined],
            ['Clotilde', 'mistral-small', false],
        ]);
    });

    it('carries the chosen thinking flag onto the bot', () => {
        const patch = retryModelPatch(gameIn(GAME_STATES.VOTE), 'Seraphine', 'claude-sonnet', true);
        expect(patch.bots?.find(b => b.name === 'Seraphine')).toMatchObject({ aiType: 'claude-sonnet', enableThinking: true });
    });

    it('switches the Game Master permanently, night narration included', () => {
        for (const state of [GAME_STATES.DAY_DISCUSSION, GAME_STATES.NIGHT]) {
            const patch = retryModelPatch(gameIn(state), GAME_MASTER, 'claude-haiku');
            expect(patch).toMatchObject({ permanent: true, modelOverride: null, gameMasterAiType: 'claude-haiku', errorState: null, retryHint: null });
            expect(patch.bots).toBeUndefined();
        }
    });

    it("keeps a bot's night action one-shot so the players list does not reveal the role", () => {
        const patch = retryModelPatch(gameIn(GAME_STATES.NIGHT), 'Clotilde', 'claude-haiku', true);
        expect(patch.permanent).toBe(false);
        expect(patch.modelOverride).toEqual({ botName: 'Clotilde', model: 'claude-haiku', enableThinking: true });
        expect(patch.bots).toBeUndefined();
        expect(patch.gameMasterAiType).toBeUndefined();
        expect(patch.errorState).toBeNull();
        expect(patch.retryHint).toBeNull();
    });
});
