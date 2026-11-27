import {firestore} from 'firebase-admin';
import {db} from '@/firebase/server';
import {logger} from '@/app/utils/logger';

/**
 * LIVE VIEWS: `gameViews/{gameId}__{uid}`, the one kind of document a browser listens to
 * directly (docs/plan-multiplayer.md, live updates). It holds what ONE seat may see: the
 * game as cut for that player (app/utils/game-view.ts) and the messages the last change
 * added for them. The game itself holds every role and stays unreadable by a browser
 * (firestore.rules).
 *
 * Why the view is stored and not fetched: a first version (2026-11-27, one day) stamped a
 * small "changed" marker and each listening page then asked the server for its view. That
 * is one server call per change per extra screen, which is exactly what decision 1 of the
 * plan rules out (the hosting plan meters processor time). A stored view costs one
 * Firestore write per seat per change and no server call at all.
 *
 * `v` is the server clock at the change (a page compares it with the stamp its own action
 * returned to tell its own change from somebody else's); `seq` counts changes, so a page
 * that sees a gap knows it missed messages and fetches the day once. `side`: something
 * was added beside the game's course (a picture drawn late), nobody played a move.
 *
 * NOT a 'use server' file. Storage only: what goes into a view is decided by the caller
 * (app/api/game-session-view.ts). Best effort: a failed write never fails the action that
 * changed the game; the other screens are then one step behind until the next one.
 */
export const GAME_VIEWS_COLLECTION = 'gameViews';

const VIEW_TTL_MS = 30 * 24 * 60 * 60 * 1000; // as long as the game's own sliding window

export const gameViewDocId = (gameId: string, uid: string) => `${gameId}__${uid}`;

export interface SeatViewWrite {
    uid: string;
    /** The seat's view of the game and its new messages, as JSON (a game has optional fields everywhere). */
    game: string;
    messages: string;
}

export async function writeSeatViews(gameId: string, v: number, views: SeatViewWrite[], side: boolean): Promise<boolean> {
    if (!db || views.length === 0) return false;
    try {
        const expireAt = firestore.Timestamp.fromMillis(v + VIEW_TTL_MS);
        await Promise.all(views.map(view =>
            db!.collection(GAME_VIEWS_COLLECTION).doc(gameViewDocId(gameId, view.uid)).set({
                uid: view.uid, gameId, v, side,
                seq: firestore.FieldValue.increment(1),
                game: view.game, messages: view.messages, expireAt,
            }, {merge: true}),
        ));
        return true;
    } catch (error: any) {
        logger.warn('Could not write the live view of a game', {gameId, error: error?.message});
        return false;
    }
}

/** The game is gone: nothing to listen to. */
export async function deleteSeatViews(gameId: string): Promise<void> {
    try {
        const views = await db?.collection(GAME_VIEWS_COLLECTION).where('gameId', '==', gameId).get();
        await Promise.all((views?.docs ?? []).map((doc: any) => doc.ref.delete()));
    } catch (error: any) {
        logger.warn('Could not delete the live views of a game', {gameId, error: error?.message});
    }
}
