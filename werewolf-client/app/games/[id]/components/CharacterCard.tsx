'use client';

import React, { useEffect } from 'react';
import { Game, GAME_MASTER, GAME_ROLES, GAME_STATES, PLAY_STYLE_CONFIGS } from '@/app/api/game-models';
import { getModelDisplayName } from '@/app/ai/ai-models';
import { getAvatarUrl } from '@/app/utils/avatar-utils';
import PlayerAvatar from '@/app/components/PlayerAvatar';

interface CharacterCardProps {
    game: Game;
    name: string; // participant name: bot, human player, or GAME_MASTER
    onClose: () => void;
}

/**
 * Click-to-expand character card: large portrait, story, play style, model,
 * and only the role knowledge the human player legitimately has (own role,
 * dead players, fellow werewolves when playing werewolf, everyone at game over).
 */
export default function CharacterCard({ game, name, onClose }: CharacterCardProps) {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

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
    const avatarUrl = getAvatarUrl(game, name);

    const roleColor = role === GAME_ROLES.WEREWOLF
        ? 'border-[var(--danger)] text-[var(--danger)]'
        : role === GAME_ROLES.DOCTOR
            ? 'border-green-500 text-green-500'
            : 'border-[var(--line-3)] text-[var(--fg-2)]';

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[2px]"
            onClick={onClose}
        >
            <div
                className="w-[340px] max-w-[calc(100vw-32px)] rounded-2xl overflow-hidden bg-[var(--bg-1)] border border-[var(--line-2)] shadow-2xl"
                onClick={e => e.stopPropagation()}
            >
                <div className="relative">
                    {avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- authed dynamic route; next/image can't optimize it
                        <img src={avatarUrl} alt={name} className={`w-full block ${isDead ? 'grayscale brightness-[.55]' : ''}`} />
                    ) : (
                        <div className="w-full aspect-square flex items-center justify-center bg-[var(--bg-2)]">
                            <PlayerAvatar name={name} size={140} isGM={isGM} isDead={isDead} />
                        </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[var(--bg-1)] to-transparent" />
                    <div className="absolute left-4 bottom-2 text-[24px] font-bold text-white [text-shadow:0_2px_8px_rgba(0,0,0,0.9)]">
                        {name}{isDead ? ' ✝' : ''}
                    </div>
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
                    <div className="flex justify-between text-[12px] text-[var(--fg-2)]">
                        <span>Model: <span className="text-[var(--fg-0)]">{isHuman ? 'Human' : getModelDisplayName(aiType!)}</span></span>
                        {playStyleName && <span>Play style: <span className="text-[var(--fg-0)]">{playStyleName}</span></span>}
                    </div>
                    <p className="m-0 text-[13px] leading-relaxed text-[var(--fg-1)]">{story}</p>
                </div>
            </div>
        </div>
    );
}
