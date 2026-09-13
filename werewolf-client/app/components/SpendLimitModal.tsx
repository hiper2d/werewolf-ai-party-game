'use client';

import React, {useEffect} from 'react';
import Link from 'next/link';
import {freeSpendLimitScope, freeSpendLimitWindow} from '@/app/api/errors';

/**
 * The popup a player sees when a free-tier ceiling refuses a call. Two variants:
 *
 *   account   an allowance is used up (their own daily/monthly cap, or one of the device
 *             ceilings - see below for why those are not distinguished here)
 *   global    the whole platform's free pool for today is gone; nothing to do with them
 *
 * The device ceilings deliberately render as an ordinary daily limit. Copy that named the
 * browser would tell a farmer exactly which axis to change; see the note in
 * `freeSpendLimitMessage`. The server still logs which ceiling actually refused.
 *
 * Shown once per refusal and dismissable. The persistent in-game banner stays underneath
 * it, so dismissing the popup does not lose the explanation.
 */

export interface SpendLimitModalProps {
    /** The refusal message from the server; the scope is recovered from its wording. */
    message: string;
    onClose: () => void;
}

/** Next UTC midnight (or the 1st) rendered in the viewer's own clock. */
function resetLabel(window: 'day' | 'month'): string {
    const now = new Date();
    const at = window === 'day'
        ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
        : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    return at.toLocaleString(undefined, {dateStyle: 'medium', timeStyle: 'short'});
}

export default function SpendLimitModal({message, onClose}: SpendLimitModalProps) {
    const scope = freeSpendLimitScope(message);
    const window = freeSpendLimitWindow(message) ?? 'day';

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    if (!scope) {
        return null;
    }

    const content = {
        global: {
            title: 'Free play is paused for today',
            body: "Everyone on the free tier shares a daily pool of AI, and today's pool is spent. This is not about your account - you have allowance left.",
            aside: `Free play resumes ${resetLabel('day')} (your local time), at midnight UTC.`,
            cta: 'Add funds to keep playing now',
        },
        account: {
            title: window === 'day'
                ? 'Today\'s free AI allowance is used up'
                : 'This month\'s free AI allowance is used up',
            body: 'The free tier includes a daily and a monthly amount of AI on the platform\'s keys. The game is paused, not broken - nothing was charged and nothing was lost.',
            aside: `It resets ${resetLabel(window)} (your local time), ${window === 'day' ? 'at midnight UTC' : 'on the 1st at midnight UTC'}.`,
            cta: 'Add funds',
        },
    }[scope];

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[oklch(0%_0_0_/_0.55)]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="spend-limit-title"
            onClick={onClose}
        >
            <div
                className="w-full max-w-[460px] rounded-[var(--radius-xl)] border border-[var(--line-2)] bg-[var(--bg-1)] shadow-[var(--shadow-2)] p-6 flex flex-col gap-4"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-start gap-3">
                    <span className="flex-none w-9 h-9 rounded-full grid place-items-center bg-[var(--warn-soft)] border border-[var(--warn-line)] text-[var(--warn-fg)]">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10"/>
                            <polyline points="12 6 12 12 16 14"/>
                        </svg>
                    </span>
                    <h2 id="spend-limit-title" className="m-0 text-[17px] font-semibold tracking-[-0.01em] text-[var(--fg-0)] leading-snug">
                        {content.title}
                    </h2>
                </div>

                <p className="m-0 text-[13.5px] leading-[1.55] text-[var(--fg-1)]">{content.body}</p>
                <p className="m-0 text-[12.5px] leading-[1.5] text-[var(--fg-2)]">{content.aside}</p>

                <div className="h-px bg-[var(--line-1)]"/>

                <div className="flex items-center gap-2 flex-wrap">
                    <Link
                        href="/profile"
                        className="inline-flex items-center justify-center gap-2 flex-1 min-w-[160px] font-semibold text-[14px] px-5 py-[11px] rounded-[var(--radius-md)] bg-[var(--accent)] text-[var(--accent-fg)] border border-transparent shadow-[var(--shadow-1)] hover:bg-[var(--accent-strong)] transition-all duration-[120ms]"
                    >
                        {content.cta}
                    </Link>
                    <button
                        type="button"
                        onClick={onClose}
                        className="inline-flex items-center justify-center font-semibold text-[14px] px-5 py-[11px] rounded-[var(--radius-md)] bg-transparent text-[var(--fg-1)] border border-[var(--line-2)] hover:bg-[var(--bg-2)] hover:text-[var(--fg-0)] transition-all duration-[120ms]"
                    >
                        Got it
                    </button>
                </div>
            </div>
        </div>
    );
}
