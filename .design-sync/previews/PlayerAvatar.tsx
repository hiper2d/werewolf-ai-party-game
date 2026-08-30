import React from 'react';
import { PlayerAvatar } from 'werewolf-client';

// Inline SVG portrait stands in for the generated themed avatars (served by an
// authed route in the app, unreachable from previews).
const PORTRAIT = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><rect width="96" height="96" fill="%23283040"/><circle cx="48" cy="38" r="17" fill="%23aab4c4"/><path d="M17 96c3-22 16-31 31-31s28 9 31 31z" fill="%23aab4c4"/></svg>`.replace(/%23/g, '#'),
);

/** The row of sizes used across the app: 24 (chat), 32 (players list), 44 (cinematic). */
export function Sizes() {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <PlayerAvatar name="Miriam" size={24} />
            <PlayerAvatar name="Jonas" size={32} />
            <PlayerAvatar name="Elder Rook" size={44} />
            <PlayerAvatar name="Sable" size={64} />
        </div>
    );
}

/** With a generated portrait vs the initial-letter gradient fallback. */
export function PortraitAndFallback() {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <PlayerAvatar name="Miriam" size={64} avatarUrl={PORTRAIT} />
            <PlayerAvatar name="Miriam" size={64} />
        </div>
    );
}

/** The Game Master ring and the dead-player treatment. */
export function GmAndDead() {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <PlayerAvatar name="Game Master" size={44} isGM />
            <PlayerAvatar name="Jonas" size={44} isDead />
            <PlayerAvatar name="Sable" size={44} isDead avatarUrl={PORTRAIT} />
        </div>
    );
}
