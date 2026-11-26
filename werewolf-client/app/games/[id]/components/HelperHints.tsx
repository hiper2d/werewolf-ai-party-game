'use client';

import {useEffect, useLayoutEffect, useMemo, useState} from 'react';
import {createPortal} from 'react-dom';
import Link from 'next/link';
import {HelperHint, HelperHintState, visibleHelperHints} from '@/app/games/[id]/helper-hints';
import {onRetiredHintsChange, readRetiredHints, retireHelperHint} from '@/app/games/[id]/helper-hint-storage';

/**
 * The hints of a game in helper mode (app/games/[id]/helper-hints.ts). A hint with a
 * target is a CALLOUT: a small bubble with an arrow, placed next to the element that
 * carries `data-hint="<target>"`. A hint without one, or whose element is not on the
 * screen (the side panel is hidden on a phone), is a line above the composer.
 *
 * "Got it" retires a hint for this game; "Hide hints" turns them all off in this browser
 * (a small "Show hints" brings them back). Both are remembered in localStorage; with
 * storage unavailable the hints just show.
 */

const OFF_KEY = 'helperHintsOff';
const CALLOUT_WIDTH = 260;
const GAP = 10;

/** `side`: the callout sits to the right of the element, arrow on its left edge (rows of a list). */
interface Placement { left: number; top: number; arrowLeft: number; above: boolean; side?: boolean }

/** A callout's box on the screen, for the overlap test. The height is an estimate (two to four lines). */
const CALLOUT_HEIGHT = 120;
function boxOf(place: Placement): {left: number; top: number; right: number; bottom: number} {
    const top = place.side ? place.top - CALLOUT_HEIGHT / 2 : place.above ? place.top - CALLOUT_HEIGHT : place.top;
    return {left: place.left, top, right: place.left + CALLOUT_WIDTH, bottom: top + CALLOUT_HEIGHT};
}

/**
 * Where each targeted hint's element is now. A target that is missing or hidden gets no
 * entry (the hint becomes a line), and a callout that would cover an earlier one is held
 * back (`waiting`) until that one is retired: hints are ordered, the earlier one wins.
 */
function measure(hints: HelperHint[]): {placed: Record<string, Placement>; waiting: string[]} {
    const all: Record<string, Placement> = {};
    for (const hint of hints) {
        if (!hint.target) continue;
        const el = document.querySelector<HTMLElement>(`[data-hint="${hint.target}"]`);
        const rect = el?.getBoundingClientRect();
        if (!rect || rect.width === 0 || rect.height === 0) continue;
        if (hint.target === 'player' && rect.right + GAP + CALLOUT_WIDTH + 8 <= window.innerWidth) {
            all[hint.id] = {left: rect.right + GAP, top: rect.top + rect.height / 2, arrowLeft: 0, above: false, side: true};
            continue;
        }
        const centre = rect.left + rect.width / 2;
        const left = Math.min(Math.max(8, centre - CALLOUT_WIDTH / 2), window.innerWidth - CALLOUT_WIDTH - 8);
        // Above an element in the lower half of the screen, below one in the upper half.
        const above = rect.top > window.innerHeight / 2;
        all[hint.id] = {
            left,
            top: above ? rect.top - GAP : rect.bottom + GAP,
            arrowLeft: Math.min(Math.max(14, centre - left), CALLOUT_WIDTH - 14),
            above,
        };
    }
    const placed: Record<string, Placement> = {};
    const waiting: string[] = [];
    for (const hint of hints) {
        const place = all[hint.id];
        if (!place) continue;
        const box = boxOf(place);
        const covers = Object.values(placed).map(boxOf).some(other =>
            box.left < other.right && other.left < box.right && box.top < other.bottom && other.top < box.bottom);
        if (covers) waiting.push(hint.id); else placed[hint.id] = place;
    }
    return {placed, waiting};
}

export default function HelperHints({gameId, state}: {gameId: string; state: HelperHintState}) {
    const [dismissed, setDismissed] = useState<string[]>([]);
    const [off, setOff] = useState(false);
    // Storage is read after mount: the server render and the first paint show no hint.
    const [ready, setReady] = useState(false);
    useEffect(() => {
        setDismissed(readRetiredHints(gameId));
        try { setOff(localStorage.getItem(OFF_KEY) === '1'); } catch { /* private mode */ }
        setReady(true);
        // A hint can be retired by the button it explains (helper-hint-storage.ts).
        return onRetiredHintsChange(gameId, () => setDismissed(readRetiredHints(gameId)));
    }, [gameId]);

    const hints = useMemo(() => visibleHelperHints(state, new Set(dismissed)), [state, dismissed]);
    const hintKey = hints.map(hint => hint.id).join(',');

    // The targets move (the composer grows, the window resizes, the chat scrolls the page
    // on a phone): measure now, on resize and scroll, and on a slow timer for the rest.
    const [layout, setLayout] = useState<{placed: Record<string, Placement>; waiting: string[]}>({placed: {}, waiting: []});
    const placements = layout.placed;
    useLayoutEffect(() => {
        if (!ready || off) return;
        const update = () => setLayout(previous => {
            const next = measure(hints);
            return JSON.stringify(next) === JSON.stringify(previous) ? previous : next;
        });
        update();
        window.addEventListener('resize', update);
        window.addEventListener('scroll', update, true);
        const timer = window.setInterval(update, 400);
        return () => {
            window.removeEventListener('resize', update);
            window.removeEventListener('scroll', update, true);
            window.clearInterval(timer);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ready, off, hintKey]);

    if (!ready || hints.length === 0) return null;

    const dismiss = (id: string) => {
        setDismissed([...dismissed, id]);
        retireHelperHint(gameId, id);
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

    const callouts = hints.filter(hint => placements[hint.id]);
    const lines = hints.filter(hint => !placements[hint.id] && !layout.waiting.includes(hint.id));
    const link = (hint: HelperHint) => hint.link && <>{' '}<Link href={hint.link.href} className="underline underline-offset-2 font-medium">{hint.link.label}</Link></>;

    return (
        <>
            {lines.map(hint => (
                <div key={hint.id} role="note" data-helper-hint={hint.id} className="flex items-start gap-3 px-4 lg:px-7 py-2.5 border-b border-[var(--accent-line)] bg-[var(--accent-soft)]">
                    <span aria-hidden="true" className="mt-[1px] shrink-0 font-mono text-[10.5px] tracking-[0.13em] uppercase text-[var(--accent-text)]">Hint</span>
                    <p className="m-0 flex-grow text-[13px] leading-[1.5] text-[var(--fg-0)]">{hint.text}{link(hint)}</p>
                    <div className="shrink-0 flex items-center gap-3 text-[12px]">
                        <button type="button" onClick={() => dismiss(hint.id)} className="font-medium text-[var(--fg-0)] hover:underline underline-offset-2">Got it</button>
                        <button type="button" onClick={() => switchOff(true)} className="text-[var(--fg-2)] hover:text-[var(--fg-0)] transition-colors">Hide hints</button>
                    </div>
                </div>
            ))}
            {callouts.length > 0 && createPortal(
                callouts.map(hint => {
                    const place = placements[hint.id];
                    return (
                        <div
                            key={hint.id}
                            role="note"
                            data-helper-hint={hint.id}
                            className="fixed z-40 rounded-[var(--radius-lg)] bg-[var(--accent)] text-[var(--accent-fg)] shadow-2xl px-3.5 py-3"
                            style={{left: place.left, top: place.top, width: CALLOUT_WIDTH, transform: place.side ? 'translateY(-50%)' : place.above ? 'translateY(-100%)' : undefined}}
                        >
                            <span
                                aria-hidden="true"
                                className="absolute w-3 h-3 rotate-45 bg-[var(--accent)]"
                                style={place.side ? {left: -5, top: 'calc(50% - 6px)'} : {left: place.arrowLeft - 6, ...(place.above ? {bottom: -5} : {top: -5})}}
                            />
                            <p className="relative m-0 text-[13px] leading-[1.45] font-medium">{hint.text}{link(hint)}</p>
                            <div className="relative mt-2 flex items-center justify-between text-[12px]">
                                <button type="button" onClick={() => switchOff(true)} className="opacity-70 hover:opacity-100 transition-opacity">Hide hints</button>
                                <button type="button" onClick={() => dismiss(hint.id)} className="font-semibold px-2.5 py-1 rounded-[var(--radius-md)] bg-black/15 hover:bg-black/25 transition-colors">Got it</button>
                            </div>
                        </div>
                    );
                }),
                document.body,
            )}
        </>
    );
}
