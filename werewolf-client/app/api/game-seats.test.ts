import {seatFor, seatsOfGame} from './game-seats';
import {firebaseUidForEmail} from '@/app/utils/firebase-uid';

const solo = {ownerEmail: 'host@example.com', humanPlayerName: 'Ann', createdAt: 5};

describe('game seats', () => {
    it('gives a game without stored seats one seat: the owner as host, playing the human character', () => {
        expect(seatsOfGame(solo)).toEqual([{
            uid: firebaseUidForEmail('host@example.com'), email: 'host@example.com', character: 'Ann',
            payer: true, joinedAt: 5, host: true,
        }]);
        expect(seatFor(solo, 'host@example.com')?.host).toBe(true);
        expect(seatFor(solo, 'Host@Example.com')?.character).toBe('Ann');
    });

    it('gives nobody else a seat', () => {
        expect(seatFor(solo, 'other@example.com')).toBeNull();
        expect(seatFor(solo, null)).toBeNull();
        expect(seatFor(solo, '')).toBeNull();
    });

    it('lets whoever opens a game from before owners were stored sit as its host', () => {
        const legacy = {ownerEmail: '', humanPlayerName: 'Ann'};
        expect(seatsOfGame(legacy)).toEqual([]);
        expect(seatFor(legacy, 'anyone@example.com')).toMatchObject({character: 'Ann', host: true});
    });

    it('reads stored seats, with the host being the owner account', () => {
        const shared = {
            ...solo,
            seats: {
                [firebaseUidForEmail('host@example.com')]: {email: 'host@example.com', character: 'Ann', payer: true, joinedAt: 5},
                [firebaseUidForEmail('friend@example.com')]: {email: 'friend@example.com', character: 'Bo', payer: false, joinedAt: 9},
            },
        };
        expect(seatsOfGame(shared).map(s => [s.character, s.host])).toEqual([['Ann', true], ['Bo', false]]);
        expect(seatFor(shared, 'friend@example.com')).toMatchObject({character: 'Bo', host: false, payer: false, uid: firebaseUidForEmail('friend@example.com')});
        expect(seatFor(shared, 'stranger@example.com')).toBeNull();
    });

    it('follows the owner when the game moves to another account', () => {
        const moved = {...solo, ownerEmail: 'account@example.com'};
        expect(seatFor(moved, 'host@example.com')).toBeNull();
        expect(seatFor(moved, 'account@example.com')?.host).toBe(true);
    });
});
