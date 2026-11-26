import {HELPER_HINTS, HINTS_OFF_HINT, HelperHintState, visibleHelperHints} from "@/app/games/[id]/helper-hints";

const base: HelperHintState = {gameState: 'DAY_DISCUSSION', currentDay: 1, humanAlive: true, humanMessagesToday: 0, repliesStarted: false, busy: false,
    composerOpens: 0, composerOpen: false, voteOpen: false};
const hints = (patch: Partial<HelperHintState>, dismissed: string[] = []) =>
    visibleHelperHints({...base, ...patch}, new Set(dismissed));
const ids = (patch: Partial<HelperHintState>, dismissed: string[] = []) => hints(patch, dismissed).map(h => h.id);

describe('visibleHelperHints', () => {
    it('opens day 1 with two callouts: the mute button and the input', () => {
        expect(hints({}).map(h => [h.id, h.target, h.text])).toEqual([
            ['voices', 'mute', 'This mutes and unmutes the voices for the whole game.'],
            ['introduce', 'composer', 'Introduce yourself to the other players.'],
        ]);
    });
    it('dismisses each callout on its own', () => {
        expect(ids({}, ['voices'])).toEqual(['introduce']);
        expect(ids({}, ['voices', 'introduce'])).toEqual([]);
    });
    it('drops the first two once the player has written', () => {
        expect(ids({humanMessagesToday: 1})).toEqual([]);
    });
    it('points at a player once the answering bots are chosen', () => {
        expect(hints({humanMessagesToday: 1, repliesStarted: true}).map(h => [h.id, h.target, h.text])).toEqual([
            ['player_card', 'player', 'Click on a player to see their card or change their model.'],
        ]);
        expect(ids({humanMessagesToday: 4, repliesStarted: true, busy: true})).toEqual(['player_card']);
        expect(ids({humanMessagesToday: 1, repliesStarted: true}, ['player_card'])).toEqual([]);
        expect(ids({humanMessagesToday: 1, repliesStarted: true, currentDay: 2})).toEqual([]);
    });
    it('points at the conversation buttons after the second message, when the table is quiet', () => {
        expect(ids({humanMessagesToday: 2, repliesStarted: true, busy: true})).toEqual(['player_card']);
        expect(hints({humanMessagesToday: 2, repliesStarted: true}).map(h => [h.id, h.target])).toEqual([
            ['player_card', 'player'], ['talk_without_typing', 'talk'],
        ]);
        // Pressing Go on (or either Select Bots button) retires it before it shows.
        expect(ids({humanMessagesToday: 2, repliesStarted: true}, ['player_card', 'talk_without_typing'])).toEqual([]);
        expect(ids({humanMessagesToday: 1, repliesStarted: true}, ['player_card'])).toEqual([]);
    });
    it('explains the input icons the third time the input is opened', () => {
        expect(ids({composerOpens: 2, composerOpen: true}, ['voices', 'introduce'])).toEqual([]);
        expect(ids({composerOpens: 3, composerOpen: false}, ['voices', 'introduce'])).toEqual([]);
        expect(hints({composerOpens: 3, composerOpen: true}, ['voices', 'introduce']).map(h => [h.id, h.target, h.text])).toEqual([
            ['compose_tools', 'compose-tools', 'Auto-generate your answer or use your own voice.'],
        ]);
    });
    it('points at Vote once it unlocks', () => {
        expect(ids({voteOpen: true, busy: true}, ['voices', 'introduce'])).toEqual([]);
        const open = hints({voteOpen: true, currentDay: 2});
        expect(open.map(h => [h.id, h.target])).toEqual([['vote_open', 'vote']]);
        expect(open[0].text).toContain('At 100% the vote begins automatically');
    });
    it('says nothing in any other phase or on a later day', () => {
        for (const gameState of ['WELCOME', 'VOTE', 'VOTE_RESULTS', 'NIGHT', 'NIGHT_RESULTS', 'GAME_OVER']) {
            expect(ids({gameState})).toEqual([]);
        }
        expect(ids({currentDay: 2})).toEqual([]);
        expect(ids({currentDay: 2, humanMessagesToday: 2})).toEqual(['talk_without_typing']);
    });
});

describe('the catalog', () => {
    it('has unique ids and says when each hint applies', () => {
        const ids = HELPER_HINTS.map(h => h.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const hint of HELPER_HINTS) {
            expect(hint.when.length).toBeGreaterThan(0);
            expect(hint.text.length).toBeGreaterThan(0);
        }
    });
    it('keeps the hints-are-off note out of the tour', () => {
        expect(HELPER_HINTS.some(h => h.id === HINTS_OFF_HINT.id)).toBe(false);
        expect(HINTS_OFF_HINT.target).toBe('help');
    });
});
