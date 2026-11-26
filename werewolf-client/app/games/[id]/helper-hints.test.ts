import {HelperHintState, pickHelperHint} from "@/app/games/[id]/helper-hints";

const base: HelperHintState = {
    gameState: 'DAY_DISCUSSION', currentDay: 1, humanAlive: true, humanMessagesToday: 0,
    werewolfCount: 2, isGuest: false, busy: false,
};
const pick = (patch: Partial<HelperHintState>, dismissed: string[] = []) =>
    pickHelperHint({...base, ...patch}, new Set(dismissed));

describe('pickHelperHint', () => {
    it('opens day 1 by telling the player to write', () => {
        const hint = pick({});
        expect(hint?.id).toBe('first_message');
        expect(hint?.text).toContain('Two of these characters are werewolves');
        expect(pick({werewolfCount: 1})?.text).toContain('One of these characters is a werewolf');
    });
    it('moves on as the player writes', () => {
        expect(pick({humanMessagesToday: 1})?.id).toBe('mention');
        expect(pick({humanMessagesToday: 3})?.id).toBe('start_vote_1');
    });
    it('shows nothing while the bots are answering', () => {
        expect(pick({busy: true})).toBeNull();
    });
    it('does not repeat a dismissed hint', () => {
        expect(pick({}, ['first_message'])).toBeNull();
        expect(pick({humanMessagesToday: 3}, ['start_vote_1'])).toBeNull();
        // The vote hint comes back on a later day: it is a new discussion.
        expect(pick({humanMessagesToday: 3, currentDay: 2}, ['start_vote_1'])?.id).toBe('start_vote_2');
    });
    it('explains each phase after the discussion', () => {
        expect(pick({gameState: 'VOTE'})?.id).toBe('vote');
        expect(pick({gameState: 'VOTE_RESULTS'})?.id).toBe('vote_results');
        expect(pick({gameState: 'NIGHT'})?.id).toBe('night');
        expect(pick({gameState: 'NIGHT_RESULTS'})?.text).toContain('Next Day');
        expect(pick({currentDay: 2})?.id).toBe('new_day_2');
    });
    it('tells a guest what the sign-in is for', () => {
        expect(pick({gameState: 'NIGHT_RESULTS', isGuest: true})?.text).toContain('sign in to keep playing');
        const over = pick({gameState: 'GAME_OVER', isGuest: true});
        expect(over?.link).toBeUndefined();
    });
    it('covers elimination and the end of the game', () => {
        expect(pick({humanAlive: false})?.id).toBe('eliminated');
        expect(pick({gameState: 'VOTE', humanAlive: false})?.id).toBe('eliminated');
        expect(pick({gameState: 'GAME_OVER', humanAlive: false})?.link?.href).toBe('/games/newgame');
    });
    it('is silent in states with nothing to say', () => {
        expect(pick({gameState: 'NEW_DAY_BOT_SUMMARIES'})).toBeNull();
        expect(pick({gameState: 'WELCOME'})).toBeNull();
    });
});
