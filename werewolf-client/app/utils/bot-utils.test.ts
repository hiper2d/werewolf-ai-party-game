import { getEffectiveModel } from './bot-utils';
import { Game, GAME_MASTER } from '@/app/api/game-models';

// getEffectiveModel only reads modelOverride, so a minimal game stub is enough.
const gameWith = (modelOverride: Game['modelOverride']): Game => ({ modelOverride } as Game);

describe('getEffectiveModel', () => {
    it('returns the base model when no override is pending', () => {
        expect(getEffectiveModel(gameWith(null), 'Jace', 'mistral-medium-3', true))
            .toEqual({ aiType: 'mistral-medium-3', enableThinking: true });
    });

    it('defaults enableThinking to false when the base flag is undefined', () => {
        expect(getEffectiveModel(gameWith(null), 'Jace', 'mistral-medium-3'))
            .toEqual({ aiType: 'mistral-medium-3', enableThinking: false });
    });

    it('applies a pending override for the matching player', () => {
        const game = gameWith({ botName: 'Jace', model: 'claude-fable-5-1', enableThinking: true });
        expect(getEffectiveModel(game, 'Jace', 'mistral-medium-3', false))
            .toEqual({ aiType: 'claude-fable-5-1', enableThinking: true });
    });

    it('ignores an override targeting a different player', () => {
        const game = gameWith({ botName: 'Selkie', model: 'claude-fable-5-1' });
        expect(getEffectiveModel(game, 'Jace', 'mistral-medium-3', true))
            .toEqual({ aiType: 'mistral-medium-3', enableThinking: true });
    });

    it('uses the override thinking flag, not the base flag, when overriding', () => {
        const game = gameWith({ botName: 'Jace', model: 'claude-fable-5-1' });
        expect(getEffectiveModel(game, 'Jace', 'mistral-medium-3', true))
            .toEqual({ aiType: 'claude-fable-5-1', enableThinking: false });
    });

    it('supports the Game Master as an override target', () => {
        const game = gameWith({ botName: GAME_MASTER, model: 'claude-fable-5-1' });
        expect(getEffectiveModel(game, GAME_MASTER, 'gemini-flash', false))
            .toEqual({ aiType: 'claude-fable-5-1', enableThinking: false });
    });

    it('ignores an override with an empty model', () => {
        const game = gameWith({ botName: 'Jace', model: '' });
        expect(getEffectiveModel(game, 'Jace', 'mistral-medium-3'))
            .toEqual({ aiType: 'mistral-medium-3', enableThinking: false });
    });
});
