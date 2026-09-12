'use client';

import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};

/**
 * An epoch-ms instant in the viewer's clock. The server render can only know UTC,
 * so that is the server snapshot; the browser's locale/timezone takes over on the
 * client without a hydration mismatch.
 */
export default function LocalTime({ at }: { at: number }) {
    const label = useSyncExternalStore(
        subscribe,
        () => new Date(at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }),
        () => `${new Date(at).toISOString().slice(0, 16).replace('T', ' ')} UTC`,
    );
    return <span>{label}</span>;
}
