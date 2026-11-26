'use client';

import React, { useEffect } from 'react';
import { GAME_ROLES } from '@/app/api/game-models';
import { ROLE_DETAILS, RoleDetail } from '@/app/rules/role-details';

interface RoleCardProps {
    role: string; // GAME_ROLES value
    own?: boolean; // true when this is the human player's own role
    onClose: () => void;
    // Overrides the /roles/<role>.jpg static asset. Only for rendering outside
    // the app (the design kit, previews) where that path can't resolve.
    imageSrc?: string;
    // The start screen shows this card WHILE a starter game is being created
    // (app/games/components/StarterGames.tsx): over the story's picture, with a
    // line about the table, and with a button that is the only way on.
    backdropSrc?: string; // a full-screen picture behind the card
    note?: React.ReactNode; // a line above the rules text
    actionLabel?: string; // the button's text ("Got it" by default)
    actionDisabled?: boolean;
    locked?: boolean; // no X, and Escape / a click outside do nothing
}

// GAME_ROLES values → the written rules entry on /rules (same wording, one source).
const ROLE_DETAIL_BY_ROLE: Record<string, RoleDetail | undefined> = {
    [GAME_ROLES.WEREWOLF]: ROLE_DETAILS.find(d => d.name === 'Werewolf'),
    [GAME_ROLES.MANIAC]: ROLE_DETAILS.find(d => d.name === 'Maniac'),
    [GAME_ROLES.DOCTOR]: ROLE_DETAILS.find(d => d.name === 'Doctor'),
    [GAME_ROLES.DETECTIVE]: ROLE_DETAILS.find(d => d.name === 'Detective'),
    [GAME_ROLES.VILLAGER]: ROLE_DETAILS.find(d => d.name === 'Villager'),
};

/**
 * First-open "your role" card, styled after CharacterCard: schematic chalk
 * illustration, role title, team, and the same rules wording as /rules.
 * Shown once when a freshly created game is opened (see GamePage).
 * @category Game
 */
export default function RoleCard({ role, own = false, onClose, imageSrc, backdropSrc, note, actionLabel, actionDisabled = false, locked = false }: RoleCardProps) {
    useEffect(() => {
        if (locked) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose, locked]);

    const detail = ROLE_DETAIL_BY_ROLE[role];
    if (!detail) return null;

    const isWerewolfTeam = detail.team === 'werewolf';
    const roleColor = role === GAME_ROLES.WEREWOLF
        ? 'border-[var(--danger)] text-[var(--danger)]'
        : role === GAME_ROLES.DOCTOR
            ? 'border-green-500 text-green-500'
            : 'border-[var(--line-3)] text-[var(--fg-2)]';

    return (
        <div
            className={`fixed inset-0 z-50 flex items-center justify-center ${backdropSrc ? 'bg-black' : 'bg-[var(--overlay)] backdrop-blur-[2px]'}`}
            onClick={locked ? undefined : onClose}
        >
            {backdropSrc && (
                <>
                    {/* eslint-disable-next-line @next/next/no-img-element -- already in the browser's cache from the story card */}
                    <img src={backdropSrc} alt="" className="absolute inset-0 w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/55" />
                </>
            )}
            <div
                className="relative w-[340px] max-w-[calc(100vw-32px)] max-h-[calc(100vh-32px)] overflow-y-auto rounded-2xl bg-[var(--bg-1)] border border-[var(--line-2)] shadow-2xl"
                onClick={e => e.stopPropagation()}
            >
                <div className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element -- small static asset, no optimization needed */}
                    <img src={imageSrc ?? `/roles/${role}.jpg`} alt={detail.name} className="w-full block" />
                    {/* Same softened plate as CharacterCard: short and faint. */}
                    <div className="absolute inset-x-0 bottom-0 h-12" style={{background: 'linear-gradient(to top, var(--bg-1) 8%, color-mix(in srgb, var(--bg-1) 30%, transparent) 55%, transparent)'}} />
                    <div className="absolute left-4 bottom-2 card-plate-name text-[24px] font-bold">
                        {own ? `You are the ${detail.name}` : detail.name}
                    </div>
                    {!locked && <button
                        onClick={onClose}
                        className="absolute top-2.5 right-2.5 w-7 h-7 flex items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
                        aria-label="Close"
                    >
                        <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <path d="M2 2l10 10M12 2L2 12" />
                        </svg>
                    </button>}
                </div>
                <div className="p-4 flex flex-col gap-2.5">
                    <div className="flex gap-1.5 flex-wrap">
                        {own && (
                            <span className="text-[11px] font-semibold tracking-wide px-2 py-0.5 rounded-md border border-[var(--accent-line)] text-[var(--you-fg)]">YOUR ROLE</span>
                        )}
                        <span className={`text-[11px] font-semibold tracking-wide uppercase px-2 py-0.5 rounded-md border ${roleColor}`}>{detail.name}</span>
                        <span className={`text-[11px] font-semibold tracking-wide px-2 py-0.5 rounded-md border ${isWerewolfTeam ? 'border-[var(--danger)] text-[var(--danger)]' : 'border-[var(--line-3)] text-[var(--fg-3)]'}`}>
                            {isWerewolfTeam ? 'Wins with the werewolves' : 'Wins with the village'}
                        </span>
                    </div>
                    {note && <div className="text-[13px] leading-relaxed font-medium text-[var(--fg-0)]">{note}</div>}
                    {detail.nightOrder && (
                        <div className="text-[12px] text-[var(--fg-2)]">{detail.nightOrder}</div>
                    )}
                    <p className="m-0 text-[13px] leading-relaxed text-[var(--fg-1)]">{detail.body}</p>
                    {detail.oneTimeAbility && (
                        <p className="m-0 text-[13px] leading-relaxed text-[var(--fg-1)]">
                            <span className="font-semibold">One-time ability:</span> {detail.oneTimeAbility}
                        </p>
                    )}
                    <button
                        onClick={onClose}
                        disabled={actionDisabled}
                        className={actionLabel
                            ? "mt-1 w-full py-2.5 rounded-lg bg-[var(--accent)] text-[var(--accent-fg)] hover:brightness-110 disabled:opacity-70 disabled:cursor-progress text-[13px] font-semibold transition-all"
                            : "mt-1 w-full py-2 rounded-lg bg-[var(--bg-3)] hover:bg-[var(--bg-4)] border border-[var(--line-2)] text-[13px] font-semibold text-[var(--fg-0)] transition-colors"}
                    >
                        {actionLabel ?? 'Got it'}
                    </button>
                </div>
            </div>
        </div>
    );
}
