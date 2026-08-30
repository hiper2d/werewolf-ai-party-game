'use client';

import React, { useEffect, useRef, useState } from 'react';
import { FREE_TIER_AVATAR_REGENS, Game, GAME_MASTER, GAME_ROLES, GAME_STATES, PLAY_STYLE_CONFIGS, USER_TIERS } from '@/app/api/game-models';
import { getModelDisplayName } from '@/app/ai/ai-models';
import { getAvatarUrl, getAvatarVariantState } from '@/app/utils/avatar-utils';
import { isPresetAvatarUrl } from '@/app/utils/preset-avatars';
import { getAvatarGradient } from '@/app/utils/color-utils';
import PlayerAvatar from '@/app/components/PlayerAvatar';

interface CharacterCardProps {
    game: Game;
    name: string; // participant name: bot, human player, or GAME_MASTER
    onClose: () => void;
    // The owner may flip between this character's portrait candidates and
    // reroll the whole cast; everyone else sees the card read-only.
    isOwner?: boolean;
    onGameChange?: (patch: Partial<Game>) => void;
    // Server actions, injected by the page (avatar-actions.ts). Props rather
    // than imports so this stays a pure presentational component — renderable
    // outside Next (tests, the design kit) without dragging in auth/Firestore.
    onRegenerate?: (gameId: string) => Promise<Partial<Game> | null>;
    onSelectVariant?: (gameId: string, key: string, index: number) => Promise<{key: string; sel: number; version: number} | null>;
    // Overrides the game-derived portrait URL. Only for rendering outside a
    // live game (the design kit, previews) where /api/games/... can't resolve.
    avatarUrl?: string;
}

/**
 * Click-to-expand character card: large portrait, story, play style, model,
 * and only the role knowledge the human player legitimately has (own role,
 * dead players, fellow werewolves when playing werewolf, everyone at game over).
 * @category Game
 */
export default function CharacterCard({ game, name, onClose, isOwner = false, onGameChange, onRegenerate, onSelectVariant, avatarUrl: avatarUrlOverride }: CharacterCardProps) {
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
    const [regenerating, setRegenerating] = useState(false);
    const [regenError, setRegenError] = useState<string | null>(null);
    // Arrow clicks are instant; the writes behind them run one at a time, and a
    // click during a write just replaces the target. Without that, flipping
    // through five candidates would queue five round-trips and could land them
    // out of order — the shown face and the stored choice would disagree.
    const pendingSelection = useRef<number | null>(null);
    const committing = useRef(false);

    const isGM = name === GAME_MASTER;
    const isHuman = name === game.humanPlayerName;
    const bot = game.bots.find(b => b.name === name);
    if (!isGM && !isHuman && !bot) return null;

    const isGameOver = game.gameState === GAME_STATES.GAME_OVER || game.gameState === GAME_STATES.AFTER_GAME_DISCUSSION;
    const isDead = bot ? !bot.isAlive : (isHuman && game.humanPlayerIsAlive === false);
    const role = isGM ? null : isHuman ? game.humanPlayerRole : bot!.role;
    const roleVisible = !isGM && (
        isHuman || isDead || isGameOver ||
        (game.humanPlayerRole === GAME_ROLES.WEREWOLF && role === GAME_ROLES.WEREWOLF)
    );
    const story = isGM ? 'The omniscient narrator of this story — keeper of every secret at the table.' : isHuman ? 'The only human at the table.' : bot!.story;
    const aiType = isGM ? game.gameMasterAiType : bot?.aiType;
    const playStyleName = bot ? (PLAY_STYLE_CONFIGS[bot.playStyle]?.name ?? bot.playStyle) : null;
    const avatarUrl = avatarUrlOverride ?? getAvatarUrl(game, name);

    // Owner controls only make sense over a real generated portrait — while the
    // set is still generating (or failed) the card shows a preset sketch.
    const themedPortrait = !!avatarUrl && !isPresetAvatarUrl(avatarUrl);
    const showOwnerControls = isOwner && game.avatarsStatus === 'ready' && themedPortrait && !!onSelectVariant;
    const rerollsLeft = game.createdWithTier === USER_TIERS.PAID
        ? Infinity
        : Math.max(0, FREE_TIER_AVATAR_REGENS - (game.avatarRegenCount ?? 0));
    // Browsing off the committed choice is served straight from the candidate
    // subcollection, so the new face appears on the click instead of after the
    // selection write round-trips.
    const portraitSrc = !avatarUrlOverride && showOwnerControls && viewIndex !== variantState.selected
        ? `/api/games/${game.id}/avatars/${encodeURIComponent(variantState.key)}?n=${viewIndex}`
        : avatarUrl;

    const stepVariant = (delta: number) => {
        if (regenerating || variantState.count < 2) return;
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

    const rerollPortraits = async () => {
        if (regenerating || rerollsLeft <= 0 || !onRegenerate) return;
        setRegenerating(true);
        setRegenError(null);
        try {
            const result = await onRegenerate(game.id);
            if (!result) {
                setRegenError('Reroll unavailable right now.');
                return;
            }
            onGameChange?.(result);
            const sel = result.avatarVariants?.[variantState.key]?.sel;
            if (typeof sel === 'number') setViewIndex(sel);
        } catch (error: any) {
            setRegenError(error?.message ?? 'Reroll failed.');
        } finally {
            setRegenerating(false);
        }
    };

    const roleColor = role === GAME_ROLES.WEREWOLF
        ? 'border-[var(--danger)] text-[var(--danger)]'
        : role === GAME_ROLES.DOCTOR
            ? 'border-green-500 text-green-500'
            : 'border-[var(--line-3)] text-[var(--fg-2)]';

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] backdrop-blur-[2px]"
            onClick={onClose}
        >
            <div
                className="w-[340px] max-w-[calc(100vw-32px)] rounded-2xl overflow-hidden bg-[var(--bg-1)] border border-[var(--line-2)] shadow-2xl"
                onClick={e => e.stopPropagation()}
            >
                <div
                    className="relative"
                    style={avatarUrl && isPresetAvatarUrl(avatarUrl)
                        // Preset mannequins are pencil-on-white: multiply over the
                        // character's gradient so the placeholder carries their color.
                        ? {background: `linear-gradient(135deg, ${getAvatarGradient(name)[0]} 0%, ${getAvatarGradient(name)[1]} 100%)`}
                        : undefined}
                >
                    {avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- authed dynamic route; next/image can't optimize it
                        <img src={portraitSrc} alt={name} className={`w-full block ${isDead ? 'grayscale brightness-[.55]' : ''} ${regenerating ? 'opacity-60' : ''}`} style={isPresetAvatarUrl(avatarUrl) ? {mixBlendMode: 'multiply'} : undefined} />
                    ) : (
                        <div className="w-full aspect-square flex items-center justify-center bg-[var(--bg-2)]">
                            <PlayerAvatar name={name} size={140} isGM={isGM} isDead={isDead} />
                        </div>
                    )}
                    {/* Short, faint plate: solid only at the very bottom edge, faint above —
                        a tall or strong fade reads as a white blanket over the portrait. */}
                    <div className="absolute inset-x-0 bottom-0 h-14" style={{background: 'linear-gradient(to top, var(--bg-1) 8%, color-mix(in srgb, var(--bg-1) 30%, transparent) 55%, transparent)'}} />
                    <div className="card-plate-name absolute left-4 bottom-2 text-[24px] font-bold">
                        {name}{isDead ? ' ✝' : ''}
                    </div>
                    {/* Owner portrait controls, tucked into the corner opposite the
                        name plate: arrows walk this character's candidates (each click
                        commits the one on screen), the circular arrow draws a fresh
                        grid for the whole cast — one image call covers everyone, so a
                        reroll costs the same whether one face or all of them bother you. */}
                    {showOwnerControls && (
                        <div className="absolute right-2.5 bottom-2 flex items-center gap-1.5">
                            {variantState.count > 1 && (
                                <div className="flex items-center rounded-full bg-black/55 text-white backdrop-blur-[2px]">
                                    <button
                                        onClick={() => stepVariant(-1)}
                                        disabled={regenerating}
                                        className="w-6 h-7 flex items-center justify-center rounded-l-full hover:bg-white/15 disabled:opacity-40 transition-colors"
                                        aria-label="Previous portrait"
                                        title="Previous portrait"
                                    >
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                            <polyline points="15 18 9 12 15 6" />
                                        </svg>
                                    </button>
                                    <span className="text-[11px] font-mono tabular-nums px-0.5 select-none">{viewIndex + 1}/{variantState.count}</span>
                                    <button
                                        onClick={() => stepVariant(1)}
                                        disabled={regenerating}
                                        className="w-6 h-7 flex items-center justify-center rounded-r-full hover:bg-white/15 disabled:opacity-40 transition-colors"
                                        aria-label="Next portrait"
                                        title="Next portrait"
                                    >
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                            <polyline points="9 18 15 12 9 6" />
                                        </svg>
                                    </button>
                                </div>
                            )}
                            <button
                                onClick={rerollPortraits}
                                disabled={regenerating || rerollsLeft <= 0}
                                className="w-7 h-7 flex items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-[2px] hover:bg-black/75 disabled:opacity-40 disabled:hover:bg-black/55 transition-colors"
                                aria-label="Draw new portraits"
                                title={rerollsLeft <= 0
                                    ? 'Free games get one portrait reroll, and it has been used'
                                    : rerollsLeft === Infinity
                                        ? 'Draw new portraits for everyone (~$0.07)'
                                        : 'Draw new portraits for everyone — one reroll left'}
                            >
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={regenerating ? 'animate-spin' : ''}>
                                    <polyline points="23 4 23 10 17 10" />
                                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                                </svg>
                            </button>
                        </div>
                    )}
                    {regenerating && (
                        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-[12px] text-white font-medium drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
                            Drawing new portraits…
                        </div>
                    )}
                    <button
                        onClick={onClose}
                        className="absolute top-2.5 right-2.5 w-7 h-7 flex items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
                        aria-label="Close"
                    >
                        <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <path d="M2 2l10 10M12 2L2 12" />
                        </svg>
                    </button>
                </div>
                <div className="p-4 flex flex-col gap-2.5">
                    <div className="flex gap-1.5 flex-wrap empty:hidden">
                        {isHuman && (
                            <span className="text-[11px] font-semibold tracking-wide px-2 py-0.5 rounded-md border border-[var(--accent-line)] text-[var(--you-fg)]">YOU</span>
                        )}
                        {roleVisible && role && (
                            <span className={`text-[11px] font-semibold tracking-wide uppercase px-2 py-0.5 rounded-md border ${roleColor}`}>{role}</span>
                        )}
                        {isDead && (
                            <span className="text-[11px] font-semibold tracking-wide px-2 py-0.5 rounded-md border border-[var(--line-3)] text-[var(--fg-3)]">DEAD</span>
                        )}
                    </div>
                    {/* Stacked, not side by side: a long model name shares the row with
                        the play style and wraps mid-name (matches CinematicMode's plate). */}
                    <div className="flex flex-col gap-0.5 text-[12px] text-[var(--fg-2)]">
                        <span>Model: <span className="text-[var(--fg-0)]">{isHuman ? 'Human' : getModelDisplayName(aiType!)}</span></span>
                        {playStyleName && <span>Play style: <span className="text-[var(--fg-0)]">{playStyleName}</span></span>}
                    </div>
                    <p className="m-0 text-[13px] leading-relaxed text-[var(--fg-1)]">{story}</p>
                    {regenError && (
                        <p className="m-0 text-[12px] text-[var(--danger)]">{regenError}</p>
                    )}
                </div>
            </div>
        </div>
    );
}
