'use client';

import {useEffect, useState} from 'react';
import Link from 'next/link';
import {useSession} from 'next-auth/react';
import {isGuestEmail} from '@/app/utils/guest';
import {getCreditStatus, type CreditStatus} from '@/app/api/credit-actions';
import {welcomeNoteText, type WelcomeReason} from '@/app/utils/welcome-note';

/**
 * One note, once, for an account that has just arrived: what happened to the game it was
 * playing as a guest, and how much free play it has. Without it the free credits are only
 * visible on the profile page, and a guest cannot tell their game moved with them.
 *
 * Two ways in:
 *  - a guest signed in. This component is mounted on every page, so it sees the guest
 *    session first and leaves a mark in sessionStorage (it survives the OAuth round trip
 *    in the same tab); the mark plus an account session is the signal.
 *  - a brand-new account with no guest game lands on `/games/start?welcome=1` (auth.ts).
 *
 * Renders nothing otherwise, and never blocks: every storage and server call is best effort.
 */

const WAS_GUEST_KEY = 'ww_was_guest';

export default function WelcomeNote() {
    const {data: session, status} = useSession();
    const email = session?.user?.email ?? undefined;
    const [note, setNote] = useState<{reason: WelcomeReason; credit: CreditStatus | null} | null>(null);

    useEffect(() => {
        if (status !== 'authenticated' || !email) return;
        let cancelled = false;
        try {
            if (isGuestEmail(email)) {
                sessionStorage.setItem(WAS_GUEST_KEY, '1');
                return;
            }
            const url = new URL(window.location.href);
            const fromGuest = sessionStorage.getItem(WAS_GUEST_KEY) === '1';
            const fresh = url.searchParams.get('welcome') === '1';
            if (!fromGuest && !fresh) return;
            sessionStorage.removeItem(WAS_GUEST_KEY);
            if (fresh) {
                url.searchParams.delete('welcome');
                window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
            }
            const reason: WelcomeReason = fromGuest ? 'guest' : 'new';
            getCreditStatus()
                .catch(() => null)
                .then(credit => { if (!cancelled) setNote({reason, credit}); });
        } catch { /* storage unavailable: no note */ }
        return () => { cancelled = true; };
    }, [status, email]);

    if (!note) return null;
    const text = welcomeNoteText(note.reason, note.credit);

    return (
        <div role="status" className="fixed z-40 left-1/2 -translate-x-1/2 bottom-5 w-[min(520px,calc(100vw-32px))] px-4 py-3 rounded-[var(--radius-lg)] bg-[var(--bg-1)] border border-[var(--accent-line)] shadow-2xl flex items-start gap-3">
            <div className="flex-grow text-[13px] leading-[1.55] text-[var(--fg-1)]">
                <span className="font-semibold text-[var(--fg-0)]">{text.title}</span>{' '}
                {text.body}
                {text.profileLink && <>{' '}<Link href="/profile" className="underline underline-offset-2 text-[var(--fg-0)]" onClick={() => setNote(null)}>{text.profileLink}</Link></>}
            </div>
            <button
                type="button"
                onClick={() => setNote(null)}
                aria-label="Dismiss"
                className="shrink-0 w-6 h-6 grid place-items-center rounded-full text-[var(--fg-2)] hover:text-[var(--fg-0)] hover:bg-[var(--bg-3)] transition-colors"
            >
                <svg width="10" height="10" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M2 2l10 10M12 2L2 12" /></svg>
            </button>
        </div>
    );
}
