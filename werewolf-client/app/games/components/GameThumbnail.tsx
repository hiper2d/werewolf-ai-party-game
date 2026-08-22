'use client';

import { useState } from 'react';
import { Game } from '@/app/api/game-models';
import { getSceneUrl } from '@/app/utils/avatar-utils';

/**
 * The game's day (welcome) scene as a list thumbnail. Renders nothing for
 * games without generated art (legacy games, generation pending/failed) or
 * when the image 404s (avatars succeeded but the scene pair failed) — the
 * card then keeps its text-only layout.
 */
export default function GameThumbnail({ game, locked = false }: { game: Game; locked?: boolean }) {
    const [failed, setFailed] = useState(false);
    const [loaded, setLoaded] = useState(false);
    const src = getSceneUrl(game, 'welcome');
    if (!src || failed) return null;

    return (
        <div className={`flex-none w-24 h-16 sm:w-36 sm:h-24 rounded-[var(--radius-md)] overflow-hidden border border-[var(--line-1)] ${loaded ? '' : 'animate-pulse bg-[var(--bg-3)]'} ${locked ? 'grayscale' : ''}`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- authed dynamic route; next/image can't optimize it */}
            <img
                src={src}
                alt={`${game.theme} scene`}
                loading="lazy"
                className={`w-full h-full object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
                onLoad={() => setLoaded(true)}
                onError={() => setFailed(true)}
            />
        </div>
    );
}
