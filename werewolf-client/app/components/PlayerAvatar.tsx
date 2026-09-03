'use client';

import React, { useEffect, useState } from 'react';
import { getAvatarGradient } from '@/app/utils/color-utils';
import { isPresetAvatarUrl } from '@/app/utils/preset-avatars';
import { focusToBackground, ImageFocus } from '@/app/utils/avatar-framing';

interface PlayerAvatarProps {
    name: string;
    size?: number; // px, default 32
    isGM?: boolean;
    isDead?: boolean;
    className?: string;
    // Generated themed avatar. When absent, renders the initial-letter
    // gradient circle (legacy games, generation pending/failed).
    avatarUrl?: string;
    // Which part of the image fills the circle (fractions of the image) — the
    // owner's chosen circle on a portrait card, or a mannequin's circle on the
    // preset sheet. Absent = the legacy whole-image crops below.
    focus?: ImageFocus;
}

/**
 * Circular participant avatar: themed portrait when generated, initial-letter
 * gradient fallback otherwise. Used at every size from chat rows to cards.
 * @category Game
 */
export default function PlayerAvatar({ name, size = 32, isGM = false, isDead = false, className = '', avatarUrl, focus }: PlayerAvatarProps) {
    const [c1, c2] = getAvatarGradient(name);
    const initial = name.charAt(0).toUpperCase();
    const fontSize = Math.round(size * 0.42);

    // The portrait streams through an authed route; until it arrives the circle
    // shows the classic gradient + initial, then the image fades in over it.
    // Image() instances share the browser cache, so many avatars of the same
    // player cost one request.
    const [imgLoaded, setImgLoaded] = useState(false);
    useEffect(() => {
        if (!avatarUrl) { setImgLoaded(false); return; }
        let cancelled = false;
        const img = new Image();
        img.onload = () => { if (!cancelled) setImgLoaded(true); };
        img.src = avatarUrl;
        return () => { cancelled = true; };
    }, [avatarUrl]);

    // Generated portraits are head-and-shoulders busts: anchor near the top and
    // zoom slightly so the face fills the circle. Preset mannequins are waist-up
    // pose studies on pure white: show the whole figure and MULTIPLY it over the
    // per-name gradient, so the white ground takes the bot's color and every
    // placeholder is distinct by pose + color.
    // A framed portrait shows exactly its circle — the owner placed it, so no
    // extra zoom on top.
    const preset = Boolean(avatarUrl && isPresetAvatarUrl(avatarUrl));
    const focused = focus ? focusToBackground(focus) : null;
    const background = avatarUrl && imgLoaded
        ? focused
            ? `url(${avatarUrl}) ${focused.backgroundPosition}/${focused.backgroundSize} no-repeat, linear-gradient(135deg, ${c1} 0%, ${c2} 100%)`
            : preset
                ? `url(${avatarUrl}) center top/cover no-repeat, linear-gradient(135deg, ${c1} 0%, ${c2} 100%)`
                : `url(${avatarUrl}) center 15%/140% auto no-repeat, linear-gradient(135deg, ${c1} 0%, ${c2} 100%)`
        : `linear-gradient(135deg, ${c1} 0%, ${c2} 100%)`;

    const showPortrait = Boolean(avatarUrl && imgLoaded);

    return (
        <div
            className={`flex-none rounded-full flex items-center justify-center font-semibold relative overflow-hidden transition-[background] duration-300 ${isDead ? 'grayscale brightness-75' : ''} ${className}`}
            style={{
                width: size,
                height: size,
                background,
                ...(preset && imgLoaded ? { backgroundBlendMode: 'multiply, normal' } : {}),
                fontSize,
                color: 'white',
                border: '1px solid rgba(0,0,0,0.2)',
            }}
        >
            {isGM && !showPortrait ? (
                <span className="text-[9px] font-mono font-bold tracking-wider">GM</span>
            ) : isDead ? (
                <svg width={fontSize} height={fontSize} viewBox="0 0 14 14" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.8" style={showPortrait ? { filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.9))' } : undefined}>
                    <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" />
                </svg>
            ) : showPortrait ? null : (
                initial
            )}
        </div>
    );
}
