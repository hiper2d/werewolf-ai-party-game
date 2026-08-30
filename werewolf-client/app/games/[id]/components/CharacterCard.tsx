'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Game } from '@/app/api/game-models';
import { getAvatarUrl, getAvatarVariantState } from '@/app/utils/avatar-utils';
import { isPresetAvatarUrl } from '@/app/utils/preset-avatars';
import CharacterPoster, { getCharacterIdentity } from './CharacterPoster';

// Past this many candidates the dots stop being countable at a glance and
// the switcher shows a numeric counter instead.
const MAX_DOT_CANDIDATES = 6;

interface CharacterCardProps {
    game: Game;
    name: string; // participant name: bot, human player, or GAME_MASTER
    onClose: () => void;
    // The owner may flip between this character's portrait candidates;
    // everyone else sees the card read-only. Drawing NEW portraits lives in
    // the participants panel (one image call covers the whole cast, so it was
    // never a per-character action).
    isOwner?: boolean;
    onGameChange?: (patch: Partial<Game>) => void;
    // Server action, injected by the page (avatar-actions.ts). A prop rather
    // than an import so this stays a pure presentational component — renderable
    // outside Next (tests, the design kit) without dragging in auth/Firestore.
    onSelectVariant?: (gameId: string, key: string, index: number) => Promise<{key: string; sel: number; version: number} | null>;
    // Overrides the game-derived portrait URL. Only for rendering outside a
    // live game (the design kit, previews) where /api/games/... can't resolve.
    avatarUrl?: string;
}

/**
 * Click-to-expand character card: the cinematic-mode poster (portrait, role
 * chip, name plate with model / play style / STORY toggle) in a modal, plus
 * the owner's portrait switcher in the top-right corner. Same component
 * cinematic mode shows beside the speech bubble, so a character looks the
 * same wherever the player meets them.
 * @category Game
 */
export default function CharacterCard({ game, name, onClose, isOwner = false, onGameChange, onSelectVariant, avatarUrl: avatarUrlOverride }: CharacterCardProps) {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    // Portrait candidates: every verification round the generator drew is kept,
    // so most characters have more than one face to choose from. `viewIndex` is
    // what the card shows; picking a different one commits it as the portrait
    // shown everywhere else in the game.
    const variantState = getAvatarVariantState(game, name);
    const [viewIndex, setViewIndex] = useState(variantState.selected);
    // Arrow clicks are instant; the writes behind them run one at a time, and a
    // click during a write just replaces the target. Without that, flipping
    // through five candidates would queue five round-trips and could land them
    // out of order — the shown face and the stored choice would disagree.
    const pendingSelection = useRef<number | null>(null);
    const committing = useRef(false);

    if (!getCharacterIdentity(game, name).exists) return null;

    const avatarUrl = avatarUrlOverride ?? getAvatarUrl(game, name);
    // The switcher only makes sense over a real generated portrait — while the
    // set is still generating (or failed) the card shows a preset sketch.
    const themedPortrait = !!avatarUrl && !isPresetAvatarUrl(avatarUrl);
    const showSwitcher = isOwner && game.avatarsStatus === 'ready' && themedPortrait && !!onSelectVariant && variantState.count > 1;
    // Browsing off the committed choice is served straight from the candidate
    // subcollection, so the new face appears on the click instead of after the
    // selection write round-trips.
    const portraitSrc = !avatarUrlOverride && showSwitcher && viewIndex !== variantState.selected
        ? `/api/games/${game.id}/avatars/${encodeURIComponent(variantState.key)}?n=${viewIndex}`
        : avatarUrl;

    const stepVariant = (delta: number) => {
        if (variantState.count < 2) return;
        const next = (viewIndex + delta + variantState.count) % variantState.count;
        setViewIndex(next);
        commitSelection(next);
    };

    const commitSelection = async (target: number) => {
        pendingSelection.current = target;
        if (committing.current) return;
        committing.current = true;
        try {
            while (pendingSelection.current !== null) {
                const next = pendingSelection.current;
                pendingSelection.current = null;
                const result = await onSelectVariant!(game.id, variantState.key, next);
                if (result) {
                    onGameChange?.({
                        avatarVariants: { ...(game.avatarVariants ?? {}), [variantState.key]: { n: variantState.count, sel: result.sel } },
                        avatarVersions: { ...(game.avatarVersions ?? {}), [variantState.key]: result.version },
                    });
                }
            }
        } catch {
            // The face on screen stands; the choice just didn't stick. The next
            // click retries it.
        } finally {
            pendingSelection.current = null;
            committing.current = false;
        }
    };

    // Owner portrait switcher, in the poster's top-right chip slot: arrows walk
    // this character's kept candidates and each click commits the one on
    // screen as the face shown everywhere in the game. Dots show where you
    // are; past six candidates a counter replaces them.
    const switcher = showSwitcher ? (
        <span className="flex items-center gap-1.5 px-1.5 py-[3px] text-white">
            <button
                onClick={() => stepVariant(-1)}
                className="flex items-center justify-center px-px py-1 rounded-full hover:bg-white/15 transition-colors"
                aria-label="Previous portrait"
                title="Previous portrait"
            >
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6" />
                </svg>
            </button>
            {variantState.count <= MAX_DOT_CANDIDATES ? (
                <span className="flex items-center gap-1" aria-label={`Portrait ${viewIndex + 1} of ${variantState.count}`}>
                    {Array.from({ length: variantState.count }, (_, i) => (
                        <span
                            key={i}
                            className={`rounded-full transition-all duration-[120ms] ${i === viewIndex ? 'w-[7px] h-[7px] bg-white' : 'w-[5px] h-[5px] bg-white/40'}`}
                        />
                    ))}
                </span>
            ) : (
                <span className="tabular-nums px-0.5 select-none">{viewIndex + 1}/{variantState.count}</span>
            )}
            <button
                onClick={() => stepVariant(1)}
                className="flex items-center justify-center px-px py-1 rounded-full hover:bg-white/15 transition-colors"
                aria-label="Next portrait"
                title="Next portrait"
            >
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                </svg>
            </button>
        </span>
    ) : null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-[3px] backdrop-saturate-[.7]"
            style={{background: 'var(--cine-scrim)'}}
            onClick={onClose}
        >
            {/* Close — top-right corner, as in cinematic mode */}
            <button
                onClick={onClose}
                aria-label="Close"
                title="Close (Esc)"
                className="fixed top-4 right-4 z-30 w-[42px] h-[42px] flex items-center justify-center rounded-full border border-[var(--line-3)] text-[var(--fg-1)] hover:text-[var(--fg-0)] transition-colors"
                style={{background: 'var(--cine-panel)', backdropFilter: 'blur(8px)'}}
            >
                <svg width="16" height="16" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M2 2l10 10M12 2L2 12"/></svg>
            </button>
            <div className="w-[min(340px,calc(100vw-32px))] cine-card-enter" onClick={e => e.stopPropagation()}>
                <CharacterPoster game={game} name={name} avatarUrl={portraitSrc} cornerChip={switcher} />
            </div>
        </div>
    );
}
