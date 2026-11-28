'use client';

import React, { useState } from 'react';
import { Game, GAME_STATES } from '@/app/api/game-models';
import { createSeatInvite, removeGameSeat } from '@/app/api/seat-actions';

/**
 * The host's part of a character card in a game that can be shared
 * (docs/plan-multiplayer.md, "D"): for a bot, the link a friend opens to take that
 * character over; for a character a person already plays, removing them (a bot takes the
 * character back). Shown to the host only; the server refuses everybody else.
 */
export default function SeatPanel({ game, name, onGame }: { game: Game; name: string; onGame: (game: Game) => void }) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [confirmRemove, setConfirmRemove] = useState(false);

    const bot = game.bots.find(b => b.name === name);
    const over = game.gameState === GAME_STATES.GAME_OVER || game.gameState === GAME_STATES.AFTER_GAME_DISCUSSION;
    if (!bot || over) return null;

    const token = Object.entries(game.seatInvites || {}).find(([, invite]) => invite.character === name)?.[0];
    const link = token && typeof window !== 'undefined' ? `${window.location.origin}/games/${game.id}/join?t=${token}` : null;

    const run = async (action: () => Promise<{ ok: true; game?: Game | null } | { ok: false; error: string }>) => {
        setBusy(true);
        setError(null);
        try {
            const result = await action();
            if (!result.ok) setError(result.error);
            else if (result.game) onGame(result.game);
        } finally {
            setBusy(false);
        }
    };

    const box = 'mt-2 rounded-[var(--radius-lg)] border border-[var(--line-2)] bg-[var(--bg-1)] px-3.5 py-3 text-[12px] text-[var(--fg-1)]';
    const button = 'px-3 py-1.5 text-[12px] font-medium rounded-[var(--radius-md)] bg-[var(--bg-3)] border border-[var(--line-3)] text-[var(--fg-0)] hover:bg-[var(--bg-4)] transition-all duration-[120ms] disabled:opacity-50';

    if (bot.human) {
        return (
            <div className={box}>
                <p className="mb-2">A friend plays {name}.</p>
                {confirmRemove ? (
                    <div className="flex items-center gap-2">
                        <span className="flex-grow">A bot takes {name} back. They need a new link to return.</span>
                        <button className={button} disabled={busy} onClick={() => setConfirmRemove(false)}>Cancel</button>
                        <button className={button} disabled={busy} onClick={() => run(() => removeGameSeat(game.id, name))}>Remove</button>
                    </div>
                ) : (
                    <button className={button} disabled={busy} onClick={() => setConfirmRemove(true)}>Remove player</button>
                )}
                {error && <p className="mt-2 text-[var(--danger)]">{error}</p>}
            </div>
        );
    }

    if (!bot.isAlive) return null;

    return (
        <div className={box}>
            {link ? (
                <>
                    <p className="mb-2">Send this link to a friend. Whoever opens it first plays {name} from now on. It works once.</p>
                    <div className="flex items-center gap-2">
                        <input readOnly value={link} onFocus={e => e.currentTarget.select()} aria-label={`Link to play ${name}`}
                               className="flex-grow min-w-0 px-2 py-1.5 rounded-[var(--radius-md)] bg-[var(--bg-0)] border border-[var(--line-2)] text-[11px] font-mono text-[var(--fg-1)]" />
                        <button className={button} onClick={async () => {
                            try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* the field is selectable */ }
                        }}>{copied ? 'Copied' : 'Copy'}</button>
                    </div>
                </>
            ) : (
                <button className={button} disabled={busy} onClick={() => run(() => createSeatInvite(game.id, name))}>
                    {busy ? 'Making the link…' : `Invite a friend to play ${name}`}
                </button>
            )}
            {error && <p className="mt-2 text-[var(--danger)]">{error}</p>}
        </div>
    );
}
