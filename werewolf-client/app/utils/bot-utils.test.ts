import { getEffectiveModel, generateBotContextSection } from './bot-utils';
import { Bot, Game, GAME_MASTER, GAME_ROLES } from '@/app/api/game-models';

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

describe('generateBotContextSection — night secrecy', () => {
    const bot = (name: string, role: string, roleKnowledge?: Bot['roleKnowledge']): Bot =>
        ({ name, role, isAlive: true, story: '', aiType: 'x', gender: 'male', voice: 'v', roleKnowledge } as Bot);

    // Night 1: the maniac abducted Leo, the werewolves killed Viktor, the doctor's
    // protection of Leo failed. Old games also carry the leaked `events` list.
    const game = {
        currentDay: 2,
        humanPlayerName: 'Leo',
        bots: [bot('Hermione', GAME_ROLES.MANIAC), bot('Harry', GAME_ROLES.WEREWOLF), bot('Ron', GAME_ROLES.DOCTOR)],
        votingHistory: [{
            day: 1,
            voteCounts: { Viktor: 2, Leo: 1 },
            votes: [
                { order: 1, voter: 'Harry', target: 'Viktor', reason: 'Too quiet all day.' },
                { order: 2, voter: 'Leo', target: 'Harry', reason: '' },
            ],
            eliminatedPlayer: 'Viktor',
            eliminatedPlayerRole: 'villager',
        }],
        nightNarratives: [{
            day: 1,
            narrative: 'Dawn breaks. Viktor lies still.',
            events: [
                { order: 0, role: 'maniac', description: 'Abducted Leo for the night, blocking all actions involving them' },
                { order: 1, role: 'werewolves', description: 'Killed Viktor (villager)' },
            ],
        }],
    } as unknown as Game;

    it('never shows a villager the maniac activity, even on a game doc that stored the old events list', () => {
        const ctx = generateBotContextSection(bot('Luna', GAME_ROLES.VILLAGER), game);
        expect(ctx).toContain('Dawn breaks. Viktor lies still.');
        expect(ctx).not.toMatch(/abduct/i);
        expect(ctx).not.toMatch(/maniac/i);
        expect(ctx).not.toContain('Events');
    });

    it('renders the vote order with reasons, and omits the quote when there is no reason', () => {
        const ctx = generateBotContextSection(bot('Luna', GAME_ROLES.VILLAGER), game);
        expect(ctx).toContain('1. Harry → Viktor: "Too quiet all day."');
        expect(ctx).toContain('2. Leo → Harry\n');
        expect(ctx).toContain('Result: Viktor eliminated (was villager)');
    });

    it('gives werewolves their attack history with the outcome but no cause', () => {
        const wolf = bot('Harry', GAME_ROLES.WEREWOLF, { attacks: [
            { day: 1, target: 'Viktor', outcome: 'killed' },
            { day: 2, target: 'Ron', outcome: 'survived' },
            { day: 3, target: 'Leo', outcome: 'failed' },
        ] });
        const ctx = generateBotContextSection(wolf, game);
        expect(ctx).toContain("Your Pack's Attack History");
        expect(ctx).toContain('Attacked **Viktor** → 💀 Viktor died');
        expect(ctx).toContain('Attacked **Ron** → ❌ Ron survived (the doctor protected them)');
        expect(ctx).toContain('Attacked **Leo** → ❌ Attack failed');
        expect(ctx).not.toMatch(/abduct|maniac/i);
    });

    it('tells the doctor a protection failed without naming the cause', () => {
        const doc = bot('Ron', GAME_ROLES.DOCTOR, { protections: [{ day: 1, target: 'Leo', success: false }] });
        const ctx = generateBotContextSection(doc, game);
        expect(ctx).toContain('Tried to protect **Leo** → ❌ Protection failed');
        expect(ctx).not.toMatch(/abduct/i);
    });
});
