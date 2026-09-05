'use client';

import { useEffect, useState } from 'react';

/**
 * Holds the last image that finished loading until the newly requested one
 * has arrived, so a portrait swap never paints a half-state.
 *
 * Why: an `<img>` keeps showing its previous picture until the new `src` has
 * loaded, while everything derived from the URL (the mannequin's multiply
 * blend, its gradient ground, the crop focus) switches on the same render.
 * Switching a character from the preset mannequin to a generated portrait
 * therefore showed the pencil sketch on bare white for the length of the
 * authed fetch. Keying every derived value on the settled view instead keeps
 * the old face intact, tint and all, and the new one appears whole.
 *
 * `requested` is keyed by its `url`; other fields (a crop focus) pass through
 * immediately once that url is the one on screen, since a reframe on the same
 * sheet changes only the focus. With `eager` the first view renders at once
 * (progressive load, as a plain `<img>` would); otherwise nothing is returned
 * until the first image has loaded, for callers with their own placeholder.
 * A failed load settles too, so a broken URL renders as it always did instead
 * of pinning the previous face forever.
 */
export function useSettledImage<T extends { url: string }>(requested: T | undefined, eager = false): T | undefined {
    const [settled, setSettled] = useState<T | undefined>(eager ? requested : undefined);
    const requestedUrl = requested?.url;

    useEffect(() => {
        if (!requestedUrl) {
            setSettled(undefined);
            return;
        }
        let cancelled = false;
        const img = new Image();
        const settle = () => { if (!cancelled) setSettled(requested); };
        img.onload = settle;
        img.onerror = settle;
        img.src = requestedUrl;
        return () => { cancelled = true; };
        // `requested` is a fresh object each render; the url is the identity.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [requestedUrl]);

    if (!requested) return undefined;
    return settled?.url === requested.url ? requested : settled;
}
