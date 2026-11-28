'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { joinGameSeat, SeatInviteInfo } from '@/app/api/seat-actions';

/** The one button of the join page: takes the place and opens the game. */
export default function JoinSeat({ gameId, token, invite }: { gameId: string; token: string; invite: SeatInviteInfo }) {
    const router = useRouter();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const join = async () => {
        setBusy(true);
        setError(null);
        const result = await joinGameSeat(gameId, token);
        if (result.ok) {
            router.push(`/games/${gameId}`);
            return;
        }
        setError(result.error);
        setBusy(false);
    };

    return (
        <div className="max-w-[520px] mx-auto mt-16 px-4">
            <div className="bg-[var(--bg-1)] border border-[var(--line-2)] rounded-[var(--radius-xl)] p-6 shadow-pop">
                <p className="text-[11px] font-mono uppercase tracking-[0.06em] text-[var(--fg-3)] mb-2">You are invited to a game</p>
                <h1 className="text-[20px] font-semibold text-[var(--fg-0)] capitalize mb-1">{invite.theme}</h1>
                <p className="text-[13px] text-[var(--fg-2)] mb-4">Day {invite.day} · {invite.players} players</p>
                <p className="text-[14px] text-[var(--fg-0)] mb-1">You will play <span className="font-semibold">{invite.character}</span>.</p>
                {invite.story && <p className="text-[13px] text-[var(--fg-1)] leading-relaxed mb-4">{invite.story}</p>}
                <p className="text-[12px] text-[var(--fg-2)] mb-5">
                    The game is already running. You take over this character as they are now, with their role, and you will see it once you join.
                </p>
                <button
                    onClick={join}
                    disabled={busy}
                    className="w-full px-4 py-2.5 text-[14px] font-medium rounded-[var(--radius-md)] bg-[var(--fg-0)] text-[var(--bg-0)] hover:brightness-110 transition-all duration-[120ms] disabled:opacity-50"
                >
                    {busy ? 'Joining…' : `Join as ${invite.character}`}
                </button>
                {error && <p className="mt-3 text-[13px] text-[var(--danger)]">{error}</p>}
            </div>
        </div>
    );
}
