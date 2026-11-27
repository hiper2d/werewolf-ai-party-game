import type {Game, GameSeat} from '@/app/api/game-models';
import {firebaseUidForEmail} from '@/app/utils/firebase-uid';

/**
 * Who sits at a game's table (docs/plan-multiplayer.md, "B. Seats"). A SEAT is a human's
 * place: an account and the character it plays. The ONE place that answers "may this
 * account touch this game" and "whom do we publish to"; nothing else compares emails.
 *
 * Seats are STORED only on a shared game (`game.seats`, keyed by the account's Firebase
 * uid). A game without them has exactly one, derived on every read: the owner playing the
 * human character. So a solo game, a game from before seats, and a guest's game that moved
 * to an account (`claimGuest` rewrites `ownerEmail`) need no migration and cannot drift.
 *
 * The HOST is the seat whose account is `ownerEmail`: one fact, stored once. A host
 * takeover will rewrite `ownerEmail`.
 *
 * NOT a 'use server' file, and server only (the uid is a keyed-by-email hash).
 */
type Seated = Pick<Game, 'ownerEmail' | 'humanPlayerName' | 'seats' | 'createdAt'>;

export interface SeatOfGame extends GameSeat {
    uid: string;
    host: boolean;
}

const sameAccount = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Every seat of the game. Empty only for a game from before owners were stored. */
export function seatsOfGame(game: Seated): SeatOfGame[] {
    const stored = game.seats && Object.keys(game.seats).length > 0 ? game.seats : null;
    if (stored) {
        return Object.entries(stored).map(([uid, seat]) => ({
            ...seat, uid, host: !!game.ownerEmail && sameAccount(seat.email, game.ownerEmail),
        }));
    }
    if (!game.ownerEmail) return [];
    return [{
        uid: firebaseUidForEmail(game.ownerEmail),
        email: game.ownerEmail,
        character: game.humanPlayerName,
        payer: true,
        joinedAt: game.createdAt || 0,
        host: true,
    }];
}

/**
 * The seat an account holds, or null. A game from before owners were stored belongs to
 * whoever can open it, as it always has: they get the host's seat.
 */
export function seatFor(game: Seated, email: string | null | undefined): SeatOfGame | null {
    if (!email || !game) return null;
    const seats = seatsOfGame(game);
    if (seats.length === 0) {
        return {uid: firebaseUidForEmail(email), email, character: game.humanPlayerName, payer: true, joinedAt: game.createdAt || 0, host: true};
    }
    return seats.find(seat => sameAccount(seat.email, email)) ?? null;
}
