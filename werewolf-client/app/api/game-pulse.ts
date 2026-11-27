import {firestore} from 'firebase-admin';
import {db} from '@/firebase/server';
import {Game} from '@/app/api/game-models';
import {firebaseUidForEmail} from '@/app/utils/firebase-uid';
import {logger} from '@/app/utils/logger';

/**
 * The game's PULSE: `gamePulse/{gameId}`, the one document a browser listens to directly
 * (docs/plan-multiplayer.md, live updates). It says only "this game changed at `v`" and
 * who may listen (`members`, Firebase uids). The game itself holds every role and stays
 * unreadable by a browser (firestore.rules); on a pulse the page asks the server for its
 * own view through the usual path (`getGameForPlayer`, the day-messages route), so there is
 * still ONE place that decides what a player sees (app/utils/game-view.ts).
 *
 * Written after every action that changed the game (the action wrapper, the actions in
 * game-actions.ts that return a game outside it) and when a picture drawn after a
 * response is posted. `v` is the server clock in ms: the page compares it with the pulse
 * its own action returned to tell its own change from somebody else's.
 *
 * NOT a 'use server' file. Best effort: a failed pulse never fails the action that
 * changed the game; the other screens are then one step behind until the next one.
 */
export const GAME_PULSE_COLLECTION = 'gamePulse';

const PULSE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // as long as the game's own sliding window

/** Who may listen: the accounts with a seat. One seat today, the owner's. */
export function pulseMembers(game: Pick<Game, 'ownerEmail'>): string[] {
    return game.ownerEmail ? [firebaseUidForEmail(game.ownerEmail)] : [];
}

/** Stamps the game as changed now; returns the stamp, or null when it could not be written. */
export async function bumpGamePulse(
    game: Pick<Game, 'id' | 'ownerEmail'> | null | undefined,
    // `side`: something was added beside the game's course (a picture drawn late). Screens
    // fetch it, but nobody played a move, so the screen running the game keeps running it.
    options: {side?: boolean} = {},
): Promise<number | null> {
    if (!db || !game?.id) return null;
    const v = Date.now();
    try {
        await db.collection(GAME_PULSE_COLLECTION).doc(game.id).set({
            v,
            members: pulseMembers(game),
            ...(options.side ? {side: true} : {}),
            expireAt: firestore.Timestamp.fromMillis(v + PULSE_TTL_MS),
        });
        return v;
    } catch (error: any) {
        logger.warn('Could not write the game pulse', {gameId: game.id, error: error?.message});
        return null;
    }
}

/** The game is gone: nothing to listen to. */
export async function deleteGamePulse(gameId: string): Promise<void> {
    try {
        await db?.collection(GAME_PULSE_COLLECTION).doc(gameId).delete();
    } catch (error: any) {
        logger.warn('Could not delete the game pulse', {gameId, error: error?.message});
    }
}
