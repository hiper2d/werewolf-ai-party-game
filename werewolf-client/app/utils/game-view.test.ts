import {Bot, Game, GAME_ROLES, GAME_STATES} from '@/app/api/game-models';
import {HIDDEN_ROLE, viewGameAs} from './game-view';

const bot = (name: string, role: string, isAlive = true): Bot => ({
    name, role, isAlive, story: '', aiType: 'x', gender: 'male', voice: 'v', playStyle: 'p',
    personalSummaries: [{day: 1, summary: `As the ${role} I…`}],
    roleKnowledge: {} as any,
});

const game = (over: Partial<Game> = {}): Game => ({
    id: 'g', humanPlayerName: 'Alex', humanPlayerRole: GAME_ROLES.VILLAGER, humanPlayerIsAlive: true,
    ownerEmail: 'a@b.c', gameState: GAME_STATES.DAY_DISCUSSION, currentDay: 1,
    gameStateProcessQueue: [], gameStateParamQueue: [],
    bots: [
        bot('Wolf1', GAME_ROLES.WEREWOLF), bot('Wolf2', GAME_ROLES.WEREWOLF),
        bot('Doc', GAME_ROLES.DOCTOR), bot('Det', GAME_ROLES.DETECTIVE),
        bot('Vil', GAME_ROLES.VILLAGER), bot('Gone', GAME_ROLES.VILLAGER, false),
    ],
    ...over,
} as Game);

const roles = (g: Game) => Object.fromEntries(g.bots.map(b => [b.name, b.role]));
const me = {name: 'Alex'};

describe('viewGameAs', () => {
    it('a villager learns only the dead', () => {
        expect(roles(viewGameAs(game(), me))).toEqual({
            Wolf1: HIDDEN_ROLE, Wolf2: HIDDEN_ROLE, Doc: HIDDEN_ROLE, Det: HIDDEN_ROLE,
            Vil: HIDDEN_ROLE, Gone: GAME_ROLES.VILLAGER,
        });
    });

    it('a werewolf also learns the pack, and nobody else', () => {
        const view = viewGameAs(game({humanPlayerRole: GAME_ROLES.WEREWOLF}), me);
        expect(roles(view)).toMatchObject({
            Wolf1: GAME_ROLES.WEREWOLF, Wolf2: GAME_ROLES.WEREWOLF, Doc: HIDDEN_ROLE, Det: HIDDEN_ROLE,
        });
        expect(view.humanPlayerRole).toBe(GAME_ROLES.WEREWOLF);
    });

    it('everything is open once the game is over', () => {
        for (const gameState of [GAME_STATES.GAME_OVER, GAME_STATES.AFTER_GAME_DISCUSSION]) {
            const view = viewGameAs(game({gameState}), me);
            expect(Object.values(roles(view))).not.toContain(HIDDEN_ROLE);
        }
    });

    it('somebody without a seat learns no living role, not even the human player\'s', () => {
        const view = viewGameAs(game({humanPlayerRole: GAME_ROLES.WEREWOLF}), null);
        expect(roles(view).Wolf1).toBe(HIDDEN_ROLE);
        expect(view.humanPlayerRole).toBe(HIDDEN_ROLE);
    });

    it('never sends a bot\'s private notes, even when the role is known', () => {
        const view = viewGameAs(game({gameState: GAME_STATES.GAME_OVER}), me);
        for (const b of view.bots) {
            expect(b).not.toHaveProperty('personalSummaries');
            expect(b).not.toHaveProperty('roleKnowledge');
        }
        expect(JSON.stringify(viewGameAs(game(), me))).not.toContain('As the werewolf');
    });

    it('counts the roles that act at night without naming them', () => {
        // werewolf, doctor, detective; the villagers do nothing at night
        expect(viewGameAs(game(), me).nightRoleTotal).toBe(3);
    });

    it('says when the vote result has decided the game', () => {
        const wolvesDead = game({
            gameState: GAME_STATES.VOTE_RESULTS,
            bots: [bot('Wolf1', GAME_ROLES.WEREWOLF, false), bot('Doc', GAME_ROLES.DOCTOR), bot('Vil', GAME_ROLES.VILLAGER)],
        });
        expect(viewGameAs(wolvesDead, me).pendingGameOver).toBeTruthy();
        expect(viewGameAs(game({gameState: GAME_STATES.VOTE_RESULTS}), me).pendingGameOver).toBeNull();
        // Only on a result screen: mid-discussion the page offers nothing.
        expect(viewGameAs({...wolvesDead, gameState: GAME_STATES.DAY_DISCUSSION}, me).pendingGameOver).toBeNull();
    });

    it('applies the night\'s resolved deaths before counting the sides', () => {
        const night = game({
            gameState: GAME_STATES.NIGHT_RESULTS,
            bots: [bot('Wolf1', GAME_ROLES.WEREWOLF), bot('Doc', GAME_ROLES.DOCTOR), bot('Vil', GAME_ROLES.VILLAGER)],
            resolvedNightState: {
                deaths: [{player: 'Wolf1', role: GAME_ROLES.WEREWOLF, cause: 'doctor_kill'}],
                abductedPlayer: null, detectiveResult: null, actionsPrevented: [],
            },
        });
        expect(viewGameAs(night, me).pendingGameOver).toBeTruthy();
        expect(viewGameAs({...night, resolvedNightState: {...night.resolvedNightState!, deaths: []}}, me).pendingGameOver).toBeNull();
    });

    it('is not cut twice: a view counted again would see no werewolves', () => {
        const once = viewGameAs(game({gameState: GAME_STATES.VOTE_RESULTS}), me);
        expect(viewGameAs(once, me)).toBe(once);
    });

    it('leaves the stub of a deleted game alone', () => {
        const stub = {id: 'g', errorState: null} as Game;
        expect(viewGameAs(stub, me)).toBe(stub);
    });
});
