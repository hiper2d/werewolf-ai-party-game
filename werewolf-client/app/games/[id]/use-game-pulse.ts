'use client';

import {useEffect, useRef} from 'react';
import {getFirebaseClient} from '@/firebase/client';

/** The same name as on the server (app/api/game-pulse.ts), which the browser cannot import. */
const GAME_PULSE_COLLECTION = 'gamePulse';

export interface GamePulse {
    /** When the game last changed, on the server's clock. */
    v: number;
    /** Something was added beside the game's course (a picture drawn late): nobody played a move. */
    side: boolean;
}

/**
 * Listens to the game's pulse (app/api/game-pulse.ts): `onPulse` runs each time the game
 * changes on the server, whoever changed it. The first value the listener delivers is the
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
            let first = true;
            unsubscribe = onSnapshot(
                doc(client.db, GAME_PULSE_COLLECTION, gameId),
                snapshot => {
                    const data = snapshot.data();
                    const baseline = first;
                    first = false;
                    if (baseline || typeof data?.v !== 'number') return;
                    handler.current({v: data.v, side: data.side === true});
                },
                error => console.warn('Game pulse listener stopped', error?.code ?? error),
            );
        })();
        return () => {
            cancelled = true;
            unsubscribe?.();
        };
    }, [gameId]);
}
