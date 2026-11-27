'use client';

import {useEffect, useRef} from 'react';
import {getFirebaseClient} from '@/firebase/client';

import type {Game, GameMessage} from '@/app/api/game-models';

/** The same name and id as on the server (app/api/game-live.ts), which the browser cannot import. */
const GAME_VIEWS_COLLECTION = 'gameViews';

export interface GamePulse {
    /** When the game last changed, on the server's clock. */
    v: number;
    /** Something was added beside the game's course (a picture drawn late): nobody played a move. */
    side: boolean;
    /** This player's view of the game after the change. */
    game: Game;
    /** The messages the change added for this player. */
    messages: GameMessage[];
    /** A change before this one was not delivered: its messages have to be fetched. */
    missed: boolean;
}

/**
 * Listens to this player's live view of the game (app/api/game-live.ts): `onPulse` runs each
 * time the game changes on the server, whoever changed it, and carries the new view, so a
 * screen that follows needs no server call. The first value the listener delivers is the
 * state the page was just rendered from, so it is skipped. With no Firebase sign-in (or a
 * listener the rules refuse) nothing is delivered and the page works as before: it learns
 * of changes from its own actions only.
 */
export function useGamePulse(gameId: string, onPulse: (pulse: GamePulse) => void): void {
    const handler = useRef(onPulse);
    useEffect(() => { handler.current = onPulse; });

    useEffect(() => {
        let cancelled = false;
        let unsubscribe: (() => void) | null = null;
        (async () => {
            const client = await getFirebaseClient();
            if (!client || cancelled) return;
            const {doc, onSnapshot} = await import('firebase/firestore');
            if (cancelled) return;
            let lastSeq: number | null = null;
            let first = true;
            unsubscribe = onSnapshot(
                doc(client.db, GAME_VIEWS_COLLECTION, `${gameId}__${client.uid}`),
                snapshot => {
                    const data = snapshot.data();
                    const baseline = first;
                    first = false;
                    if (typeof data?.v !== 'number') return;
                    const seq = typeof data.seq === 'number' ? data.seq : null;
                    const missed = lastSeq !== null && seq !== null && seq !== lastSeq + 1;
                    lastSeq = seq;
                    if (baseline) return;
                    try {
                        handler.current({
                            v: data.v, side: data.side === true, missed,
                            game: JSON.parse(data.game), messages: JSON.parse(data.messages || '[]'),
                        });
                    } catch (error) {
                        console.warn('Unreadable live view of the game', error);
                    }
                },
                error => console.warn('Game live view listener stopped', error?.code ?? error),
            );
        })();
        return () => {
            cancelled = true;
            unsubscribe?.();
        };
    }, [gameId]);
}
