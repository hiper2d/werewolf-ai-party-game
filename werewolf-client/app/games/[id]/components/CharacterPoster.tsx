'use client';

import React, { useState } from 'react';
import { Game, GAME_MASTER, GAME_ROLES, GAME_STATES, PLAY_STYLE_CONFIGS } from '@/app/api/game-models';
import { getModelDisplayName } from '@/app/ai/ai-models';
import { getAvatarUrl } from '@/app/utils/avatar-utils';
import { isPresetAvatarUrl } from '@/app/utils/preset-avatars';
import { getAvatarGradient } from '@/app/utils/color-utils';
import PlayerAvatar from '@/app/components/PlayerAvatar';

/**
 * Who a participant is, and only the role knowledge the human player
 * legitimately has: their own role, dead players, fellow werewolves when
 * playing werewolf, everyone once the game is over. Shared by every card that
 * shows a character so the gating can't drift between them.
 */
export function getCharacterIdentity(game: Game, name: string) {
    const isGM = name === GAME_MASTER;
    const isHuman = name === game.humanPlayerName;
    const bot = game.bots.find(b => b.name === name);
    const isGameOver = game.gameState === GAME_STATES.GAME_OVER || game.gameState === GAME_STATES.AFTER_GAME_DISCUSSION;
    const isDead = bot ? !bot.isAlive : (isHuman && game.humanPlayerIsAlive === false);
    const role = isGM ? null : isHuman ? game.humanPlayerRole : bot?.role ?? null;
    const roleVisible = !isGM && !!role && (
        isHuman || isDead || isGameOver ||
        (game.humanPlayerRole === GAME_ROLES.WEREWOLF && role === GAME_ROLES.WEREWOLF)
    );
    const story = isGM
        ? 'The omniscient narrator of this story — keeper of every secret at the table.'
        : isHuman ? 'The only human at the table.' : bot?.story;
    return {
        isGM, isHuman, bot, isDead, role, roleVisible, story,
        exists: isGM || isHuman || !!bot,
        modelName: isHuman ? 'Human' : getModelDisplayName(isGM ? game.gameMasterAiType : bot?.aiType ?? ''),
        playStyleName: bot ? (PLAY_STYLE_CONFIGS[bot.playStyle]?.name ?? bot.playStyle) : null,
    };
}

interface CharacterPosterProps {
    game: Game;
    name: string; // participant name: bot, human player, or GAME_MASTER
    // Top-right corner chip (cinematic mode's turn counter, the owner's
    // portrait switcher on the character card). Omit for none.
    cornerChip?: React.ReactNode;
    // Cost line in the name plate; omitted/zero hides it.
    cost?: number;
    // Cinematic mode drops the cost line on narrow stages where the plate is cramped.
    hideCostOnNarrow?: boolean;
    // Overrides the game-derived portrait URL: the design kit (no authed route
    // to hit) and the character card while browsing an alternate candidate.
    avatarUrl?: string;
    className?: string;
}

/**
 * The character poster: portrait filling a 3:4.35 card, role-tinted glow, a
 * role chip top-left, and a name plate over the bottom with model, play style,
 * cost and a STORY toggle that unfolds the character's story over the portrait.
 * The one card for a character everywhere in the game — cinematic mode shows
 * it beside the speech bubble, clicking any avatar opens it in a modal.
 * @category Game
 */
export default function CharacterPoster({ game, name, cornerChip, cost, hideCostOnNarrow = false, avatarUrl: avatarUrlOverride, className = '' }: CharacterPosterProps) {
    const [storyOpen, setStoryOpen] = useState(false);
    const id = getCharacterIdentity(game, name);
    const { isGM, isHuman, isDead, role, roleVisible, story, modelName, playStyleName } = id;
    const roleLabel = isGM ? 'GAME MASTER' : roleVisible ? `${isHuman ? 'YOU · ' : ''}${role!.toUpperCase()}` : isHuman ? 'YOU' : 'CREW';
    // Role tints per the design: crew neutral, werewolf red, GM green — built
    // from the app's theme-aware tokens so both themes read correctly.
    const tint = isGM
        ? { line: 'color-mix(in oklch, var(--gm-rail) 55%, transparent)', glow: 'color-mix(in oklch, var(--gm-rail) 32%, transparent)', text: 'var(--gm-fg)' }
        : roleVisible && role === GAME_ROLES.WEREWOLF
            ? { line: 'var(--danger-line)', glow: 'color-mix(in oklch, var(--danger) 32%, transparent)', text: 'var(--werewolf-fg)' }
            : { line: 'var(--line-3)', glow: 'color-mix(in oklch, var(--line-3) 40%, transparent)', text: 'var(--fg-1)' };
    const avatarUrl = avatarUrlOverride ?? getAvatarUrl(game, name);
    const showCost = cost !== undefined && cost > 0;

    return (
        <div
            className={`relative w-full overflow-hidden rounded-[20px] border border-[var(--line-3)] ${className}`}
            style={{
                aspectRatio: '3 / 4.35',
                boxShadow: 'var(--cine-card-shadow)',
                // Preset mannequins are pencil-on-white: the card takes the
                // character's gradient and the sketch multiplies over it.
                background: avatarUrl && isPresetAvatarUrl(avatarUrl)
                    ? `linear-gradient(135deg, ${getAvatarGradient(name)[0]} 0%, ${getAvatarGradient(name)[1]} 100%)`
                    : 'var(--bg-2)',
            }}
        >
            {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- authed dynamic route
                <img
                    src={avatarUrl}
                    alt={name}
                    className={`absolute inset-0 w-full h-full object-cover object-top ${isDead ? 'grayscale brightness-[.6]' : ''}`}
                    style={isPresetAvatarUrl(avatarUrl) ? {mixBlendMode: 'multiply'} : undefined}
                />
            ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                    <PlayerAvatar name={name} size={150} isGM={isGM} isDead={isDead} />
                </div>
            )}
            {/* Role-tinted glow ring */}
            <div aria-hidden className="absolute inset-0 rounded-[20px] pointer-events-none" style={{boxShadow: `0 0 0 1px ${tint.line} inset, 0 0 60px -10px ${tint.glow}`}} />
            {/* Corner chips */}
            <span className="absolute top-3 left-3 font-mono text-[10px] tracking-[0.1em] px-[9px] py-[4px] rounded-[5px]" style={{background: 'var(--cine-chip)', backdropFilter: 'blur(6px)', color: tint.text}}>{roleLabel}</span>
            {cornerChip && (
                <span className="absolute top-3 right-3 flex items-center font-mono text-[10px] tracking-[0.1em] rounded-[5px] text-[var(--fg-1)]" style={{background: 'var(--cine-chip)', backdropFilter: 'blur(6px)'}}>{cornerChip}</span>
            )}
            {/* Expanded story: overlays the top of the portrait, below the chips,
                so it never fights the name plate at the bottom for space. */}
            {story && storyOpen && (
                <p
                    className="absolute top-12 left-3 right-3 m-0 rounded-[8px] px-2.5 py-2 text-[12px] leading-relaxed text-[#e6e8ec] max-h-[45%] overflow-y-auto"
                    style={{background: 'rgba(10,12,16,0.62)', backdropFilter: 'blur(6px)', textShadow: 'none'}}
                >
                    {story}
                </p>
            )}
            {/* Name plate */}
            {/* text-shadow inherits: one halo declaration covers name, meta and chip. */}
            <div className="absolute inset-x-0 bottom-0 pointer-events-none px-[22px] pb-[20px] pt-[64px]" style={{background: 'var(--cine-plate)', textShadow: 'var(--cine-plate-text-shadow)'}}>
                <div className="font-bold tracking-[-0.02em] text-[clamp(20px,2vw,30px)] leading-tight" style={{color: 'var(--cine-plate-fg)'}}>{name}{isDead ? ' ✝' : ''}</div>
                <div className="mt-1.5 font-mono text-[11px] text-[var(--cine-plate-fg-2)] flex flex-col gap-0.5">
                    <span>Model <span className="text-[var(--cine-plate-fg-1)]">{modelName}</span></span>
                    {playStyleName && <span>Play style <span className="text-[var(--cine-plate-fg-1)]">{playStyleName}</span></span>}
                    {(story || showCost) && (
                        <div className="flex items-center gap-2 min-h-[20px]">
                            {showCost && <span className={hideCostOnNarrow ? 'max-[1100px]:hidden' : ''}>Cost <span className="text-[var(--cine-plate-fg-1)]">${cost.toFixed(4)}</span></span>}
                            {story && (
                                <button
                                    onClick={() => setStoryOpen(o => !o)}
                                    aria-expanded={storyOpen}
                                    className="pointer-events-auto ml-auto inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.1em] px-[9px] py-[4px] rounded-[5px] text-[var(--cine-plate-fg-2)] hover:text-[var(--cine-plate-fg)] transition-colors"
                                    style={{background: 'rgba(10,12,16,0.55)', backdropFilter: 'blur(6px)'}}
                                >
                                    STORY
                                    <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${storyOpen ? 'rotate-180' : ''}`}>
                                        <path d="M1.5 3.5L5 7l3.5-3.5" />
                                    </svg>
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
