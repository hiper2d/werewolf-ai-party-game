import {HelperHintState, visibleHelperHints} from "@/app/games/[id]/helper-hints";

const base: HelperHintState = {gameState: 'DAY_DISCUSSION', currentDay: 1, humanAlive: true, humanMessagesToday: 0};
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
    it('stops once the player has written', () => {
        expect(ids({humanMessagesToday: 1})).toEqual([]);
    });
    it('says nothing in any other phase or on a later day', () => {
        for (const gameState of ['WELCOME', 'VOTE', 'VOTE_RESULTS', 'NIGHT', 'NIGHT_RESULTS', 'GAME_OVER']) {
            expect(ids({gameState})).toEqual([]);
        }
        expect(ids({currentDay: 2})).toEqual([]);
    });
});
