'use client';

import { useState } from 'react';

/**
 * A scene as a list thumbnail: a game's day (welcome) scene, or a saved preview's
 * (app/utils/preview-drafts.ts). The caller passes the address, never the game: this is a
 * client component, and a prop is sent to the browser whole. Renders nothing when there is
 * no picture (legacy games, generation pending or failed) or the image 404s; the card then
 * keeps its text-only layout.
 */
export function SceneThumbnail({ src, alt, locked = false }: { src?: string | null; alt: string; locked?: boolean }) {
    const [failed, setFailed] = useState(false);
    const [loaded, setLoaded] = useState(false);

    // A cached image can finish (or fail) before hydration attaches the
    // onLoad/onError handlers — the load event then never reaches React and
    // the thumbnail would sit under the skeleton at opacity-0 forever. The
    // callback ref checks the element's already-settled state on attach.
    const imgRef = (el: HTMLImageElement | null) => {
        if (!el || !el.complete) return;
        if (el.naturalWidth > 0) setLoaded(true);
        else setFailed(true);
    };

    if (!src || failed) return null;

    return (
        <div className={`flex-none w-24 h-16 sm:w-36 sm:h-24 rounded-[var(--radius-md)] overflow-hidden border border-[var(--line-1)] ${loaded ? '' : 'animate-pulse bg-[var(--bg-3)]'} ${locked ? 'grayscale' : ''}`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- authed dynamic route; next/image can't optimize it */}
            <img
                ref={imgRef}
                src={src}
                alt={alt}
                loading="lazy"
                className={`w-full h-full object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
                onLoad={() => setLoaded(true)}
                onError={() => setFailed(true)}
            />
        </div>
    );
}
