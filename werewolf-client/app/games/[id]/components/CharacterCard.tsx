'use client';

import React, { useEffect, useRef, useState } from 'react';
import { AvatarFraming, Game, MANNEQUIN_VARIANT_INDEX, ReframeTarget } from '@/app/api/game-models';
import { avatarVersion, getAvatarVariantState, getReframeSource } from '@/app/utils/avatar-utils';
import { getPresetAvatarUrl, PRESET_SHEET_SIZE, PRESET_SHEET_URL } from '@/app/utils/preset-avatars';
import { cardFocus, ImageFocus } from '@/app/utils/avatar-framing';
import { getAvatarGradient } from '@/app/utils/color-utils';
import ReframeModal from '@/app/components/ReframeModal';
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
    // Server action (avatar-actions.ts reframeAvatar), injected like
    // onSelectVariant: moves the shown candidate's crop on its sheet (or the
    // mannequin's on the preset sheet). Absent = no reframe entry.
    onReframe?: (gameId: string, key: string, target: ReframeTarget, framing: AvatarFraming) => Promise<{key: string; target: ReframeTarget; version: number; framing: AvatarFraming} | null>;
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
export default function CharacterCard({ game, name, onClose, isOwner = false, onGameChange, onSelectVariant, onReframe, avatarUrl: avatarUrlOverride }: CharacterCardProps) {
    // The reframe editor sits over the card; Escape closes the editor first.
    const [reframing, setReframing] = useState(false);
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !reframing) onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose, reframing]);

    // Portrait candidates: the preset mannequin plus every kept draw, so any
    // character with a generated set has at least two faces to choose from.
    // `viewIndex` is what the card shows (MANNEQUIN_VARIANT_INDEX for the
    // mannequin); picking a different one commits it as the portrait shown
    // everywhere else in the game.
    const variantState = getAvatarVariantState(game, name);
    const [viewIndex, setViewIndex] = useState(variantState.selected);
    // Arrow clicks are instant; the writes behind them run one at a time, and a
    // click during a write just replaces the target. Without that, flipping
    // through five candidates would queue five round-trips and could land them
    // out of order — the shown face and the stored choice would disagree.
    const pendingSelection = useRef<number | null>(null);
    const committing = useRef(false);

    if (!getCharacterIdentity(game, name).exists) return null;
    // Cycle order: the mannequin sketch first, then the kept generated
    // candidates (their stored indices, which don't start at 0 once older
    // draws age out past the cap).
    const positions = [MANNEQUIN_VARIANT_INDEX, ...Array.from({ length: variantState.count }, (_, i) => variantState.first + i)];
    // Only games with a candidate record can switch — pre-variant games have
    // one fixed portrait and no stored alternates behind it.
    const showSwitcher = isOwner && game.avatarsStatus === 'ready' && !!onSelectVariant && variantState.hasCandidates;
    // Browsing off the committed choice is served straight from the candidate
    // subcollection (the mannequin resolves to its static preset — the sheet
    // with the owner's card on it when one was framed), so the new face
    // appears on the click instead of after the selection write round-trips.
    // The committed choice is left to the poster itself (getAvatarView knows
    // about framed mannequins and cache-busts per key); only an override or a
    // browsed alternate is passed in. The alternate URL carries the key's
    // version too: a reframe re-cuts that candidate doc, and an immutable
    // cached ?n= URL would keep showing the crop from before.
    const mannequinFraming = game.avatarVariants?.[variantState.key]?.mannequin;
    let portraitSrc: string | undefined = avatarUrlOverride;
    let portraitFocus: ImageFocus | undefined;
    if (!avatarUrlOverride && showSwitcher && viewIndex !== variantState.selected) {
        if (viewIndex === MANNEQUIN_VARIANT_INDEX) {
            portraitSrc = mannequinFraming ? PRESET_SHEET_URL : getPresetAvatarUrl(game.bots, name);
            portraitFocus = mannequinFraming ? cardFocus(mannequinFraming.card, PRESET_SHEET_SIZE) : undefined;
        } else {
            portraitSrc = `/api/games/${game.id}/avatars/${encodeURIComponent(variantState.key)}?n=${viewIndex}&v=${avatarVersion(game, variantState.key)}`;
        }
    }

    // What the reframe editor would open on: the viewed candidate's sheet, or
    // the preset sheet for the mannequin. Undefined = nothing to reframe
    // (candidates drawn before sheets were kept; the human's mannequin).
    const reframeTarget: ReframeTarget = viewIndex === MANNEQUIN_VARIANT_INDEX ? 'mannequin' : viewIndex;
    const reframeSource = isOwner && !!onReframe && game.avatarsStatus === 'ready' && variantState.hasCandidates
        ? getReframeSource(game, name, reframeTarget)
        : undefined;

    const saveFraming = async (framing: AvatarFraming) => {
        const result = await onReframe!(game.id, variantState.key, reframeTarget, framing);
        if (!result) throw new Error('This portrait has no sheet to reframe.');
        const entry = game.avatarVariants?.[variantState.key];
        if (!entry) return;
        onGameChange?.({
            avatarVariants: {
                ...(game.avatarVariants ?? {}),
                [variantState.key]: result.target === 'mannequin'
                    ? { ...entry, mannequin: result.framing }
                    : { ...entry, framing: { ...(entry.framing ?? {}), [String(result.target)]: result.framing } },
            },
            avatarVersions: { ...(game.avatarVersions ?? {}), [variantState.key]: result.version },
        });
    };

    // Where the shown face sits in the cycle; a selection that aged out of the
    // window anchors to the mannequin.
    const viewPosition = Math.max(0, positions.indexOf(viewIndex));

    const stepVariant = (delta: number) => {
        const next = positions[(viewPosition + delta + positions.length) % positions.length];
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
                        avatarVariants: { ...(game.avatarVariants ?? {}), [variantState.key]: { ...game.avatarVariants![variantState.key], sel: result.sel } },
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
    // the mannequin plus this character's kept candidates, and each click
    // commits the one on screen as the face shown everywhere in the game.
    // Dots show where you are; past six positions a counter replaces them.
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
            {positions.length <= MAX_DOT_CANDIDATES ? (
                <span className="flex items-center gap-1" aria-label={`Portrait ${viewPosition + 1} of ${positions.length}`}>
                    {positions.map((_, i) => (
                        <span
                            key={i}
                            className={`rounded-full transition-all duration-[120ms] ${i === viewPosition ? 'w-[7px] h-[7px] bg-white' : 'w-[5px] h-[5px] bg-white/40'}`}
                        />
                    ))}
                </span>
            ) : (
                <span className="tabular-nums px-0.5 select-none">{viewPosition + 1}/{positions.length}</span>
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
            {reframeSource && (
                <button
                    onClick={() => setReframing(true)}
                    className="flex items-center justify-center px-1 py-1 ml-0.5 rounded-full border-l border-white/20 hover:bg-white/15 transition-colors"
                    aria-label="Reframe portrait"
                    title="Move the crop on the drawn sheet"
                >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M6 2v14a2 2 0 0 0 2 2h14" />
                        <path d="M18 22V8a2 2 0 0 0-2-2H2" />
                    </svg>
                </button>
            )}
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
                <CharacterPoster game={game} name={name} avatarUrl={portraitSrc} cardFocus={portraitFocus} cornerChip={switcher} />
            </div>
            {reframing && reframeSource && (
                <div onClick={e => e.stopPropagation()}>
                    <ReframeModal
                        name={name}
                        sheetUrl={reframeSource.sheetUrl}
                        framing={reframeSource.framing}
                        initial={reframeSource.initial}
                        onSave={async framing => { await saveFraming(framing); setReframing(false); }}
                        onClose={() => setReframing(false)}
                        blendGradient={reframeTarget === 'mannequin' ? getAvatarGradient(name) : undefined}
                    />
                </div>
            )}
        </div>
    );
}
