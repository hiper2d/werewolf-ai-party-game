import {createSeatInvite, joinGameSeat, readSeatInvite, removeGameSeat} from './seat-actions';
import {db} from '@/firebase/server';
import {auth} from '@/auth';
import {getGame} from '@/app/api/game-actions';
import {publishGame} from '@/app/api/game-session-view';
import {deleteSeatView} from '@/app/api/game-live';
import {firebaseUidForEmail} from '@/app/utils/firebase-uid';
import {Bot, Game, GAME_ROLES, GAME_STATES} from '@/app/api/game-models';

jest.mock('@/firebase/server', () => ({db: {collection: jest.fn(), runTransaction: jest.fn()}}));
jest.mock('firebase-admin', () => ({firestore: {FieldValue: {delete: () => '__DELETE__'}}}));
jest.mock('@/auth', () => ({auth: jest.fn()}));
jest.mock('@/app/api/game-actions', () => ({getGame: jest.fn()}));
jest.mock('@/app/api/game-session-view', () => ({
    publishGame: jest.fn(async () => 1),
    changedGameForSession: jest.fn(async (game: any) => game),
}));
jest.mock('@/app/api/game-live', () => ({deleteSeatView: jest.fn()}));
jest.mock('@/app/utils/logger', () => ({logger: {info: jest.fn(), warn: jest.fn(), error: jest.fn()}}));

const HOST = 'host@example.com';
const FRIEND = 'friend@example.com';
const bot = (name: string, over: Partial<Bot> = {}) => ({name, role: GAME_ROLES.VILLAGER, isAlive: true, story: `${name}'s story`, ...over} as Bot);

let stored: Game;
let writes: any[];
const signIn = (email: string | null) => (auth as jest.Mock).mockResolvedValue(email ? {user: {email}} : null);

beforeEach(() => {
    jest.clearAllMocks();
    writes = [];
    stored = {
        id: 'g1', theme: 'tavern', ownerEmail: HOST, humanPlayerName: 'Ann', humanPlayerRole: GAME_ROLES.VILLAGER,
        gameState: GAME_STATES.DAY_DISCUSSION, currentDay: 1, createdAt: 5,
        bots: [bot('Bo'), bot('Cy'), bot('Dee', {isAlive: false})],
    } as Game;
    (getGame as jest.Mock).mockImplementation(async () => stored);
    (db!.collection as jest.Mock).mockReturnValue({doc: () => ({id: 'g1'})});
    // The stored doc IS the game here; an update is applied, so a second call sees the first.
    (db!.runTransaction as jest.Mock).mockImplementation(async (run: any) => run({
        get: async () => ({exists: true, data: () => stored}),
        update: (_ref: unknown, data: any) => {
            writes.push(data);
            const next: any = {...stored};
            for (const [key, value] of Object.entries(data)) {
                if (value === '__DELETE__') delete next[key]; else next[key] = value;
            }
            stored = next;
        },
    }));
});

async function invite(character = 'Bo'): Promise<string> {
    signIn(HOST);
    const made = await createSeatInvite('g1', character);
    if (!made.ok) throw new Error(made.error);
    return made.token;
}

describe('inviting a friend into a bot\'s place', () => {
    it('gives the host one link per character', async () => {
        const token = await invite();
        expect(stored.seatInvites).toEqual({[token]: {character: 'Bo', createdAt: expect.any(Number)}});
        expect(await invite()).toBe(token);
        expect(await invite('Cy')).not.toBe(token);
    });

    it('is the host\'s alone, and not a guest\'s', async () => {
        signIn(FRIEND);
        expect(await createSeatInvite('g1', 'Bo')).toEqual({ok: false, error: 'Only the host can invite players.'});
        signIn('guest-11111111-1111-4111-8111-111111111111@guest.aiwerewolf.net');
        expect((await createSeatInvite('g1', 'Bo')).ok).toBe(false);
        expect(writes).toEqual([]);
    });

    it('offers only a living bot, and not during the introductions or after the game', async () => {
        signIn(HOST);
        expect((await createSeatInvite('g1', 'Dee')).ok).toBe(false);
        expect((await createSeatInvite('g1', 'Ann')).ok).toBe(false);
        expect((await createSeatInvite('g1', 'Nobody')).ok).toBe(false);
        stored = {...stored, gameState: GAME_STATES.WELCOME};
        expect((await createSeatInvite('g1', 'Bo')).ok).toBe(false);
        stored = {...stored, gameState: GAME_STATES.GAME_OVER};
        expect((await createSeatInvite('g1', 'Bo')).ok).toBe(false);
    });
});

describe('taking the place', () => {
    it('seats the friend, stores the host\'s seat with it, uses the link up and tells every screen', async () => {
        const token = await invite();
        signIn(FRIEND);
        expect(await readSeatInvite('g1', token)).toMatchObject({ok: true, alreadySeated: false, invite: {character: 'Bo', story: 'Bo\'s story', players: 4}});

        expect(await joinGameSeat('g1', token)).toEqual({ok: true});

        expect(stored.seats).toEqual({
            [firebaseUidForEmail(HOST)]: {email: HOST, character: 'Ann', payer: true, joinedAt: 5},
            [firebaseUidForEmail(FRIEND)]: {email: FRIEND, character: 'Bo', payer: true, joinedAt: expect.any(Number)},
        });
        expect((stored as any).seatEmails).toEqual([HOST, FRIEND]);
        expect(stored.seatInvites).toEqual({});
        expect(publishGame).toHaveBeenCalledTimes(1);
    });

    it('works once: the second person is told the link no longer works', async () => {
        const token = await invite();
        signIn(FRIEND);
        await joinGameSeat('g1', token);
        signIn('late@example.com');
        expect(await joinGameSeat('g1', token)).toEqual({ok: false, error: expect.stringContaining('no longer works')});
        expect(Object.keys(stored.seats!)).toHaveLength(2);
    });

    it('does not seat one account twice, a guest, or anybody with a wrong link', async () => {
        const token = await invite();
        const second = await invite('Cy');
        signIn(FRIEND);
        await joinGameSeat('g1', token);
        expect(await joinGameSeat('g1', second)).toEqual({ok: true});
        expect(Object.values(stored.seats!).map(seat => seat.character)).toEqual(['Ann', 'Bo']);
        signIn('guest-11111111-1111-4111-8111-111111111111@guest.aiwerewolf.net');
        expect((await joinGameSeat('g1', second)).ok).toBe(false);
        signIn('late@example.com');
        expect((await joinGameSeat('g1', 'made-up')).ok).toBe(false);
        signIn(null);
        expect((await joinGameSeat('g1', second)).ok).toBe(false);
    });

    it('refuses a place whose bot died while the link was out', async () => {
        const token = await invite();
        stored = {...stored, bots: stored.bots.map(b => b.name === 'Bo' ? {...b, isAlive: false} : b)};
        signIn(FRIEND);
        expect((await joinGameSeat('g1', token)).ok).toBe(false);
        expect((await readSeatInvite('g1', token)).ok).toBe(false);
    });
});

describe('leaving and being removed', () => {
    async function seated() {
        const token = await invite();
        signIn(FRIEND);
        await joinGameSeat('g1', token);
    }

    it('the host removes a player: the game is solo again and their view is deleted', async () => {
        await seated();
        signIn(HOST);
        expect((await removeGameSeat('g1', 'Bo')).ok).toBe(true);
        expect(stored.seats).toBeUndefined();
        expect((stored as any).seatEmails).toBeUndefined();
        expect(deleteSeatView).toHaveBeenCalledWith('g1', firebaseUidForEmail(FRIEND));
    });

    it('a player leaves on their own and gets no game back', async () => {
        await seated();
        signIn(FRIEND);
        expect(await removeGameSeat('g1', 'Bo')).toEqual({ok: true, game: null});
        expect(stored.seats).toBeUndefined();
    });

    it('keeps the other players when one of three leaves', async () => {
        await seated();
        const second = await invite('Cy');
        signIn('third@example.com');
        await joinGameSeat('g1', second);
        signIn(HOST);
        await removeGameSeat('g1', 'Bo');
        expect(Object.values(stored.seats!).map(seat => seat.character)).toEqual(['Ann', 'Cy']);
        expect((stored as any).seatEmails).toEqual([HOST, 'third@example.com']);
    });

    it('nobody removes the host, and a player removes only themselves', async () => {
        await seated();
        const second = await invite('Cy');
        signIn('third@example.com');
        await joinGameSeat('g1', second);
        expect((await removeGameSeat('g1', 'Bo')).ok).toBe(false);
        expect((await removeGameSeat('g1', 'Ann')).ok).toBe(false);
        signIn(HOST);
        expect((await removeGameSeat('g1', 'Ann')).ok).toBe(false);
        expect(Object.keys(stored.seats!)).toHaveLength(3);
    });
});
