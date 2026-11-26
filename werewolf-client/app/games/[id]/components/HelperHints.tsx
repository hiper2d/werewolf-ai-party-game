'use client';

import {useEffect, useMemo, useState} from 'react';
import Link from 'next/link';
import {HelperHintState, pickHelperHint} from '@/app/games/[id]/helper-hints';

/**
 * The hint strip of a game in helper mode (app/games/[id]/helper-hints.ts): one line above
 * the composer that says what the player can do now. "Got it" retires that hint for this
 * game; "Hide hints" turns the strip off in this browser (a small "Show hints" brings it
 * back). Both are remembered in localStorage; with storage unavailable the hints just show.
 */

const OFF_KEY = 'helperHintsOff';
const dismissedKey = (gameId: string) => `helperHints:${gameId}`;

function readDismissed(gameId: string): string[] {
    try {
        const raw = JSON.parse(localStorage.getItem(dismissedKey(gameId)) ?? '[]');
        return Array.isArray(raw) ? raw.filter(item => typeof item === 'string') : [];
    } catch {
        return [];
    }
}

export default function HelperHints({gameId, state}: {gameId: string; state: HelperHintState}) {
    const [dismissed, setDismissed] = useState<string[]>([]);
    const [off, setOff] = useState(false);
    // Storage is read after mount: the server render and the first paint show no hint.
    const [ready, setReady] = useState(false);
    useEffect(() => {
        setDismissed(readDismissed(gameId));
        try { setOff(localStorage.getItem(OFF_KEY) === '1'); } catch { /* private mode */ }
        setReady(true);
    }, [gameId]);

    const hint = useMemo(() => pickHelperHint(state, new Set(dismissed)), [state, dismissed]);
    if (!ready || !hint) return null;

    const dismiss = () => {
        const next = [...dismissed, hint.id];
        setDismissed(next);
        try { localStorage.setItem(dismissedKey(gameId), JSON.stringify(next)); } catch { /* private mode */ }
    };
    const switchOff = (value: boolean) => {
        setOff(value);
        try {
            if (value) localStorage.setItem(OFF_KEY, '1'); else localStorage.removeItem(OFF_KEY);
        } catch { /* private mode */ }
    };

    if (off) {
        return (
            <div className="flex justify-end px-4 lg:px-7 pt-1.5">
                <button type="button" onClick={() => switchOff(false)} className="text-[11.5px] text-[var(--fg-3)] hover:text-[var(--fg-1)] underline underline-offset-2 transition-colors">
                    Show hints
                </button>
            </div>
        );
    }

    return (
        <div role="note" data-helper-hint={hint.id} className="flex items-start gap-3 px-4 lg:px-7 py-2.5 border-b border-[var(--accent-line)] bg-[var(--accent-soft)]">
            <span aria-hidden="true" className="mt-[1px] shrink-0 font-mono text-[10.5px] tracking-[0.13em] uppercase text-[var(--accent-text)]">Hint</span>
            <p className="m-0 flex-grow text-[13px] leading-[1.5] text-[var(--fg-0)]">
                {hint.text}
                {hint.link && <>{' '}<Link href={hint.link.href} className="underline underline-offset-2 font-medium">{hint.link.label}</Link></>}
            </p>
            <div className="shrink-0 flex items-center gap-3 text-[12px]">
                <button type="button" onClick={dismiss} className="font-medium text-[var(--fg-0)] hover:underline underline-offset-2">Got it</button>
                <button type="button" onClick={() => switchOff(true)} className="text-[var(--fg-2)] hover:text-[var(--fg-0)] transition-colors">Hide hints</button>
            </div>
        </div>
    );
}
