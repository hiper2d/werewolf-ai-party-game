import {Bot, Game, GAME_ROLES} from '@/app/api/game-models';
import {aiBots, humanCastNames, humanNames, isHumanName, isPlayerAlive, livingHumanNames, playerRole} from './cast';

const bot = (name: string, role: string, isAlive = true) => ({name, role, isAlive} as Bot);
const seat = (character: string) => ({email: `${character}@x.y`, character, payer: true, joinedAt: 1});
const solo = {
    humanPlayerName: 'Ann', humanPlayerRole: GAME_ROLES.DOCTOR, humanPlayerIsAlive: true,
    bots: [bot('Bo', GAME_ROLES.WEREWOLF), bot('Cy', GAME_ROLES.VILLAGER), bot('Di', GAME_ROLES.VILLAGER, false)],
} as Game;
const shared = {...solo, seats: {u1: seat('Ann'), u2: seat('Cy'), u3: seat('Di')}} as Game;

describe('cast', () => {
    it('a solo game has one human and every cast entry is a bot', () => {
        expect(humanNames(solo)).toEqual(['Ann']);
        expect(humanCastNames(solo).size).toBe(0);
        expect(aiBots(solo)).toBe(solo.bots);
        expect(livingHumanNames(solo)).toEqual(['Ann']);
    });

    it('a seat on a cast entry makes it a human, and the first human is never in the cast', () => {
        expect(humanNames(shared)).toEqual(['Ann', 'Cy', 'Di']);
        expect([...humanCastNames(shared)]).toEqual(['Cy', 'Di']);
        expect(aiBots(shared).map(b => b.name)).toEqual(['Bo']);
        expect(isHumanName(shared, 'Cy')).toBe(true);
        expect(isHumanName(shared, 'Bo')).toBe(false);
    });

    it('answers role and life for humans and bots alike', () => {
        expect(playerRole(shared, 'Ann')).toBe(GAME_ROLES.DOCTOR);
        expect(playerRole(shared, 'Cy')).toBe(GAME_ROLES.VILLAGER);
        expect(playerRole(shared, 'Nobody')).toBeNull();
        expect(isPlayerAlive(shared, 'Di')).toBe(false);
        expect(isPlayerAlive(shared, 'Nobody')).toBe(false);
        expect(isPlayerAlive({...shared, humanPlayerIsAlive: undefined} as Game, 'Ann')).toBe(true);
        expect(livingHumanNames(shared)).toEqual(['Ann', 'Cy']);
        expect(livingHumanNames({...shared, humanPlayerIsAlive: false} as Game)).toEqual(['Cy']);
    });
});

describe('rewinds', () => {
    it('are for solo games: a game with a second person is shared', () => {
        const {isSharedGame} = require('./cast');
        expect(isSharedGame(solo)).toBe(false);
        expect(isSharedGame({...solo, seats: {u1: seat('Ann')}})).toBe(false);
        expect(isSharedGame(shared)).toBe(true);
    });
});
