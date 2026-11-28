'use server';

import {randomBytes} from 'crypto';
import {auth} from '@/auth';
import {db} from '@/firebase/server';
import {firestore} from 'firebase-admin';
import {Game, GAME_STATES, GameSeat} from '@/app/api/game-models';
import {getGame} from '@/app/api/game-actions';
import {seatFor, seatsOfGame} from '@/app/api/game-seats';
import {changedGameForSession, publishGame} from '@/app/api/game-session-view';
import {deleteSeatView} from '@/app/api/game-live';
import {humanCastNames} from '@/app/utils/cast';
import {isGuestEmail} from '@/app/utils/guest';
import {firebaseUidForEmail} from '@/app/utils/firebase-uid';
import {logger} from '@/app/utils/logger';

/**
 * Joining a game that is already running (docs/plan-multiplayer.md, "D"). The host makes a
 * link for ONE bot's place; a signed-in friend who opens it takes that character over:
 * its role, its alive state, the chat so far. Nothing is generated and no model is called.
 *
 * Results are values, never thrown (a thrown server-action error loses its message in
 * production). Signed-in accounts only: a guest (app/utils/guest.ts) neither hosts a
 * shared game nor joins one.
 */

type Refused = { ok: false; error: string };

const isOver = (state: string) => state === GAME_STATES.GAME_OVER || state === GAME_STATES.AFTER_GAME_DISCUSSION;

async function signedInEmail(): Promise<string | null> {
    const session = await auth();
    return session?.user?.email ?? null;
}

/** A bot's place that a person may take: in the cast, alive, not already somebody's. */
function freePlace(game: Game, character: string): boolean {
    // During the introductions every bot is still to speak in its own voice.
    if (game.gameState === GAME_STATES.WELCOME) return false;
    const bot = game.bots.find(b => b.name === character);
    return !!bot && bot.isAlive && !humanCastNames(game).has(character);
}

/**
 * The host makes (or reads back) the link for one bot's place. One link per character;
 * it works once.
 */
export async function createSeatInvite(gameId: string, character: string): Promise<{ ok: true; token: string; game: Game } | Refused> {
    try {
        const email = await signedInEmail();
        if (!email || !db || typeof gameId !== 'string' || typeof character !== 'string') return {ok: false, error: 'Not authenticated'};
        if (isGuestEmail(email)) return {ok: false, error: 'Sign in to invite a friend into your game.'};
        const gameRef = db.collection('games').doc(gameId);
        const outcome = await db.runTransaction(async tx => {
            const snap = await tx.get(gameRef);
            const game = snap.exists ? await getGame(gameId) : null;
            if (!game) return {error: 'Game not found'};
            if (!seatFor(game, email)?.host) return {error: 'Only the host can invite players.'};
            if (isOver(game.gameState)) return {error: 'This game is over.'};
            if (!freePlace(game, character)) return {error: `${character} cannot be taken over.`};
            const invites: NonNullable<Game['seatInvites']> = snap.data()?.seatInvites || {};
            const existing = Object.entries(invites).find(([, invite]) => invite.character === character);
            if (existing) return {token: existing[0]};
            const token = randomBytes(18).toString('base64url');
            tx.update(gameRef, {seatInvites: {...invites, [token]: {character, createdAt: Date.now()}}});
            return {token};
        });
        if ('error' in outcome) return {ok: false, error: outcome.error!};
        return {ok: true, token: outcome.token!, game: await changedGameForSession(await getGame(gameId) as Game)};
    } catch (error: any) {
        logger.error(`createSeatInvite failed: ${error?.message}`, {gameId, character});
        return {ok: false, error: 'Could not make the link. Try again.'};
    }
}

/** What an invited person is shown before they join. Nothing secret: the place and the table. */
export interface SeatInviteInfo {
    theme: string;
    character: string;
    story: string;
    day: number;
    players: number;
}

export async function readSeatInvite(gameId: string, token: string): Promise<{ ok: true; invite: SeatInviteInfo; alreadySeated: boolean } | Refused> {
    try {
        const email = await signedInEmail();
        if (!email || typeof gameId !== 'string' || typeof token !== 'string') return {ok: false, error: 'Sign in to join this game.'};
        const game = await getGame(gameId);
        if (!game) return {ok: false, error: 'This game no longer exists.'};
        if (seatFor(game, email) && game.ownerEmail) return {ok: true, alreadySeated: true, invite: inviteInfo(game, seatFor(game, email)!.character)};
        const invite = game.seatInvites?.[token];
        if (!invite || !freePlace(game, invite.character) || isOver(game.gameState)) {
            return {ok: false, error: 'This link no longer works. Ask the host for a new one.'};
        }
        return {ok: true, alreadySeated: false, invite: inviteInfo(game, invite.character)};
    } catch (error: any) {
        logger.error(`readSeatInvite failed: ${error?.message}`, {gameId});
        return {ok: false, error: 'Could not read the link. Try again.'};
    }
}

function inviteInfo(game: Game, character: string): SeatInviteInfo {
    return {
        theme: game.theme,
        character,
        story: game.bots.find(b => b.name === character)?.story || '',
        day: game.currentDay,
        players: game.bots.length + 1,
    };
}

/**
 * Takes the place the link is for. A transaction: of two people who open one link, the
 * first sits down and the second is told the link no longer works.
 */
export async function joinGameSeat(gameId: string, token: string): Promise<{ ok: true } | Refused> {
    try {
        const email = await signedInEmail();
        if (!email || !db || typeof gameId !== 'string' || typeof token !== 'string') return {ok: false, error: 'Sign in to join this game.'};
        if (isGuestEmail(email)) return {ok: false, error: 'Sign in to join this game.'};
        const gameRef = db.collection('games').doc(gameId);
        const outcome = await db.runTransaction(async tx => {
            const snap = await tx.get(gameRef);
            const game = snap.exists ? await getGame(gameId) : null;
            if (!game || !game.ownerEmail) return {error: 'This game no longer exists.'};
            if (seatFor(game, email)) return {seated: true};
            const invites: NonNullable<Game['seatInvites']> = {...(snap.data()?.seatInvites || {})};
            const invite = invites[token];
            if (!invite || !freePlace(game, invite.character) || isOver(game.gameState)) {
                return {error: 'This link no longer works. Ask the host for a new one.'};
            }
            // The stored list always holds every seat, the host's included: a game with
            // stored seats is read from them alone (app/api/game-seats.ts).
            const seats: Record<string, GameSeat> = {};
            for (const {uid, host, ...seat} of seatsOfGame(game)) { void host; seats[uid] = seat; }
            seats[firebaseUidForEmail(email)] = {email, character: invite.character, payer: true, joinedAt: Date.now()};
            delete invites[token];
            tx.update(gameRef, {seats, seatEmails: Object.values(seats).map(seat => seat.email), seatInvites: invites});
            return {seated: true, joined: invite.character};
        });
        if ('error' in outcome) return {ok: false, error: outcome.error!};
        if (outcome.joined) {
            logger.info(`Seat taken: ${outcome.joined} in ${gameId}`, {gameId, character: outcome.joined});
            // Every screen at the table learns that a person now plays this character.
            const game = await getGame(gameId);
            if (game) await publishGame(game);
        }
        return {ok: true};
    } catch (error: any) {
        logger.error(`joinGameSeat failed: ${error?.message}`, {gameId});
        return {ok: false, error: 'Could not join the game. Try again.'};
    }
}

/**
 * A person leaves the table and their character goes on as a bot: the host removes a
 * player, or a player leaves on their own. The host's own seat cannot be given up here.
 */
export async function removeGameSeat(gameId: string, character: string): Promise<{ ok: true; game: Game | null } | Refused> {
    try {
        const email = await signedInEmail();
        if (!email || !db || typeof gameId !== 'string' || typeof character !== 'string') return {ok: false, error: 'Not authenticated'};
        const gameRef = db.collection('games').doc(gameId);
        const outcome = await db.runTransaction(async tx => {
            const snap = await tx.get(gameRef);
            const game = snap.exists ? await getGame(gameId) : null;
            if (!game) return {error: 'Game not found'};
            const caller = seatFor(game, email);
            const leaving = seatsOfGame(game).find(seat => seat.character === character);
            if (!caller || !leaving) return {error: 'No such player in this game.'};
            if (leaving.host) return {error: 'The host cannot leave their own game.'};
            if (!caller.host && caller.uid !== leaving.uid) return {error: 'Only the host can remove a player.'};
            const seats: Record<string, GameSeat> = {};
            for (const {uid, host, ...seat} of seatsOfGame(game)) { void host; if (uid !== leaving.uid) seats[uid] = seat; }
            // Alone again: the game is a solo game, stored as one.
            const solo = Object.keys(seats).length <= 1;
            tx.update(gameRef, solo
                ? {seats: firestore.FieldValue.delete(), seatEmails: firestore.FieldValue.delete()}
                : {seats, seatEmails: Object.values(seats).map(seat => seat.email)});
            return {uid: leaving.uid, self: caller.uid === leaving.uid};
        });
        if ('error' in outcome) return {ok: false, error: outcome.error!};
        // What the leaver last saw is not theirs to keep listening to.
        await deleteSeatView(gameId, outcome.uid!);
        logger.info(`Seat given up: ${character} in ${gameId}`, {gameId, character, self: outcome.self});
        const game = await getGame(gameId) as Game;
        if (outcome.self) {
            await publishGame(game);
            return {ok: true, game: null};
        }
        return {ok: true, game: await changedGameForSession(game)};
    } catch (error: any) {
        logger.error(`removeGameSeat failed: ${error?.message}`, {gameId, character});
        return {ok: false, error: 'Could not remove the player. Try again.'};
    }
}
