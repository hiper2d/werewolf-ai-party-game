'use client';

import React, { useEffect } from 'react';
import { GAME_ROLES } from '@/app/api/game-models';
import { ROLE_DETAILS, RoleDetail } from '@/app/rules/role-details';

interface RoleCardProps {
    role: string; // GAME_ROLES value
    own?: boolean; // true when this is the human player's own role
    onClose: () => void;
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
 */
export default function RoleCard({ role, own = false, onClose }: RoleCardProps) {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

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
            className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] backdrop-blur-[2px]"
            onClick={onClose}
        >
            <div
                className="w-[340px] max-w-[calc(100vw-32px)] max-h-[calc(100vh-32px)] overflow-y-auto rounded-2xl bg-[var(--bg-1)] border border-[var(--line-2)] shadow-2xl"
                onClick={e => e.stopPropagation()}
            >
                <div className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element -- small static asset, no optimization needed */}
                    <img src={`/roles/${role}.jpg`} alt={detail.name} className="w-full block" />
                    {/* Same softened plate as CharacterCard: short and faint. */}
                    <div className="absolute inset-x-0 bottom-0 h-12" style={{background: 'linear-gradient(to top, var(--bg-1) 8%, color-mix(in srgb, var(--bg-1) 30%, transparent) 55%, transparent)'}} />
                    <div className="absolute left-4 bottom-2 card-plate-name text-[24px] font-bold">
                        {own ? `You are the ${detail.name}` : detail.name}
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
                    <div className="flex gap-1.5 flex-wrap">
                        {own && (
                            <span className="text-[11px] font-semibold tracking-wide px-2 py-0.5 rounded-md border border-[var(--accent-line)] text-[var(--you-fg)]">YOUR ROLE</span>
                        )}
                        <span className={`text-[11px] font-semibold tracking-wide uppercase px-2 py-0.5 rounded-md border ${roleColor}`}>{detail.name}</span>
                        <span className={`text-[11px] font-semibold tracking-wide px-2 py-0.5 rounded-md border ${isWerewolfTeam ? 'border-[var(--danger)] text-[var(--danger)]' : 'border-[var(--line-3)] text-[var(--fg-3)]'}`}>
                            {isWerewolfTeam ? 'Wins with the werewolves' : 'Wins with the village'}
                        </span>
                    </div>
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
                        className="mt-1 w-full py-2 rounded-lg bg-[var(--bg-3)] hover:bg-[var(--bg-4)] border border-[var(--line-2)] text-[13px] font-semibold text-[var(--fg-0)] transition-colors"
                    >
                        Got it
                    </button>
                </div>
            </div>
        </div>
    );
}
