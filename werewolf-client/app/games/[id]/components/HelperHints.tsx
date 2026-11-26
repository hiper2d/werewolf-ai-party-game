'use client';

import {useEffect, useLayoutEffect, useMemo, useState} from 'react';
import {createPortal} from 'react-dom';
import {HELPER_HINTS, HINTS_OFF_HINT, HelperHint, HelperHintState, visibleHelperHints} from '@/app/games/[id]/helper-hints';
import {
    clearRetiredHints, onRetiredHintsChange, readHintsOff, readRetiredHints, retireHelperHint, writeHintsOff, writeHintsOffTold,
} from '@/app/games/[id]/helper-hint-storage';

/**
 * The helper hints on screen (app/games/[id]/helper-hints.ts). A hint is a CALLOUT: a small
 * bubble with an arrow, placed next to the element that carries `data-hint="<target>"`.
 *
 * Two modes:
 *  - as the player plays (`auto`, games in helper mode): each hint pops up at its moment.
 *    "Got it" retires it for this game; "Hide hints" turns them all off in this browser,
 *    and the first time that happens one last callout points at the "?" button.
 *  - the tour (`tourOpen`, any game): the whole catalog, one hint at a time. A hint whose
 *    element is not on screen is a card in the middle of the screen with its `when` line.
 *
 * Choices are remembered in localStorage; with storage unavailable the hints just show.
 */

const CALLOUT_WIDTH = 260;
const TOUR_WIDTH = 300;
const GAP = 10;

/** `side`: the callout sits to the right of the element, arrow on its left edge (rows of a list). */
interface Placement { left: number; top: number; arrowLeft: number; above: boolean; side?: boolean }

/** Where a callout of `width` goes for this hint's element; null when the element is missing or hidden. */
function place(hint: HelperHint, width: number): Placement | null {
    const el = document.querySelector<HTMLElement>(`[data-hint="${hint.target}"]`);
    const rect = el?.getBoundingClientRect();
    if (!el || !rect || rect.width === 0 || rect.height === 0) return null;
    // Laid out but not shown: the input's toolbar keeps its size inside a collapsed,
    // fully transparent row.
    for (let node: HTMLElement | null = el; node; node = node.parentElement) {
        if (getComputedStyle(node).opacity === '0') return null;
    }
    if (hint.target === 'player' && rect.right + GAP + width + 8 <= window.innerWidth) {
        return {left: rect.right + GAP, top: rect.top + rect.height / 2, arrowLeft: 0, above: false, side: true};
    }
    const centre = rect.left + rect.width / 2;
    const left = Math.min(Math.max(8, centre - width / 2), window.innerWidth - width - 8);
    // Above an element in the lower half of the screen, below one in the upper half.
    const above = rect.top > window.innerHeight / 2;
    return {
        left,
        top: above ? rect.top - GAP : rect.bottom + GAP,
        arrowLeft: Math.min(Math.max(14, centre - left), width - 14),
        above,
    };
}

/** A callout's box on the screen, for the overlap test. The height is an estimate (two to four lines). */
const CALLOUT_HEIGHT = 120;
function boxOf(p: Placement): {left: number; top: number; right: number; bottom: number} {
    const top = p.side ? p.top - CALLOUT_HEIGHT / 2 : p.above ? p.top - CALLOUT_HEIGHT : p.top;
    return {left: p.left, top, right: p.left + CALLOUT_WIDTH, bottom: top + CALLOUT_HEIGHT};
}

/**
 * Placements for the hints shown as the player plays. A callout that would cover an
 * earlier one is left out until that one is retired (the catalog is ordered, the earlier
 * hint wins), and so is one whose element is not on screen.
 */
function layOut(hints: HelperHint[]): Record<string, Placement> {
    const placed: Record<string, Placement> = {};
    for (const hint of hints) {
        const p = place(hint, CALLOUT_WIDTH);
        if (!p) continue;
        const box = boxOf(p);
        const covers = Object.values(placed).map(boxOf).some(other =>
            box.left < other.right && other.left < box.right && box.top < other.bottom && other.top < box.bottom);
        if (!covers) placed[hint.id] = p;
    }
    return placed;
}

function Bubble({placement, width, children}: {placement: Placement | null; width: number; children: React.ReactNode}) {
    // No element to point at: a card in the middle of the screen.
    const style: React.CSSProperties = placement
        ? {left: placement.left, top: placement.top, width, transform: placement.side ? 'translateY(-50%)' : placement.above ? 'translateY(-100%)' : undefined}
        : {left: '50%', top: '50%', width, transform: 'translate(-50%, -50%)'};
    return (
        <div role="note" className="fixed z-40 rounded-[var(--radius-lg)] bg-[var(--accent)] text-[var(--accent-fg)] shadow-2xl px-3.5 py-3" style={style}>
            {placement && (
                <span
                    aria-hidden="true"
                    className="absolute w-3 h-3 rotate-45 bg-[var(--accent)]"
                    style={placement.side ? {left: -5, top: 'calc(50% - 6px)'} : {left: placement.arrowLeft - 6, ...(placement.above ? {bottom: -5} : {top: -5})}}
                />
            )}
            <div className="relative">{children}</div>
        </div>
    );
}

const quietButton = 'opacity-70 hover:opacity-100 transition-opacity disabled:opacity-30 disabled:cursor-default';
const solidButton = 'font-semibold px-2.5 py-1 rounded-[var(--radius-md)] bg-black/15 hover:bg-black/25 transition-colors';

interface HelperHintsProps {
    gameId: string;
    state: HelperHintState;
    /** Hints pop up as the player plays (a game in helper mode, on the current day, outside the scene view). */
    auto: boolean;
    /** The "?" button's tour is running. */
    tourOpen: boolean;
    onTourClose: () => void;
}

export default function HelperHints({gameId, state, auto, tourOpen, onTourClose}: HelperHintsProps) {
    const [retired, setRetired] = useState<string[]>([]);
    const [off, setOff] = useState(false);
    const [offTold, setOffTold] = useState(true);
    // Storage is read after mount: the server render and the first paint show no hint.
    const [ready, setReady] = useState(false);
    useEffect(() => {
        setRetired(readRetiredHints(gameId));
        const saved = readHintsOff();
        setOff(saved.off);
        setOffTold(saved.told);
        setReady(true);
        // A hint can be retired by the button it explains (helper-hint-storage.ts).
        return onRetiredHintsChange(gameId, () => setRetired(readRetiredHints(gameId)));
    }, [gameId]);

    const [step, setStep] = useState(0);
    useEffect(() => { if (tourOpen) setStep(0); }, [tourOpen]);
    useEffect(() => {
        if (!tourOpen) return;
        const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onTourClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [tourOpen, onTourClose]);

    // What is on screen: the tour's one step, or the hints of the moment, or (hints just
    // turned off for the first time) the note that points at the "?" button.
    const shown: HelperHint[] = useMemo(() => {
        if (tourOpen) return [HELPER_HINTS[Math.min(step, HELPER_HINTS.length - 1)]];
        if (!auto) return [];
        if (off) return offTold ? [] : [HINTS_OFF_HINT];
        return visibleHelperHints(state, new Set(retired));
    }, [tourOpen, step, auto, off, offTold, state, retired]);
    const shownKey = shown.map(hint => hint.id).join(',');

    // The targets move (the input grows, the window resizes, a panel scrolls): measure now,
    // on resize and scroll, and on a slow timer for everything else.
    const [placements, setPlacements] = useState<Record<string, Placement>>({});
    useLayoutEffect(() => {
        if (!ready || shown.length === 0) return;
        const update = () => setPlacements(previous => {
            const next = tourOpen
                ? Object.fromEntries(shown.map(hint => [hint.id, place(hint, TOUR_WIDTH)]).filter(([, p]) => p)) as Record<string, Placement>
                : layOut(shown);
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
    }, [ready, shownKey, tourOpen]);

    if (!ready || shown.length === 0) return null;

    if (tourOpen) {
        const hint = shown[0];
        const index = Math.min(step, HELPER_HINTS.length - 1);
        const last = index === HELPER_HINTS.length - 1;
        const placement = placements[hint.id] ?? null;
        const showAsIPlay = () => {
            clearRetiredHints(gameId);
            writeHintsOff(false);
            setOff(false);
            onTourClose();
        };
        return createPortal(
            <Bubble placement={placement} width={TOUR_WIDTH}>
                <div data-helper-hint={hint.id} data-helper-tour="1">
                    <div className="flex items-center justify-between text-[11px] font-mono tracking-[0.1em] uppercase opacity-70">
                        <span>Hint {index + 1} of {HELPER_HINTS.length}</span>
                        <button type="button" onClick={onTourClose} aria-label="Close the hints" className="w-5 h-5 grid place-items-center rounded-full hover:bg-black/15">
                            <svg width="9" height="9" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M2 2l10 10M12 2L2 12" /></svg>
                        </button>
                    </div>
                    <p className="m-0 mt-1.5 text-[13px] leading-[1.45] font-medium">{hint.text}</p>
                    {/* Nothing to point at right now: say when the player will meet it. */}
                    {!placement && <p className="m-0 mt-1.5 text-[12px] leading-[1.4] opacity-75">{hint.when}.</p>}
                    <div className="mt-2.5 flex items-center justify-between text-[12px]">
                        <button type="button" onClick={() => setStep(index - 1)} disabled={index === 0} className={quietButton}>Back</button>
                        <button type="button" onClick={() => (last ? onTourClose() : setStep(index + 1))} className={solidButton}>{last ? 'Done' : 'Next'}</button>
                    </div>
                    {last && (
                        <button type="button" onClick={showAsIPlay} className="mt-2 w-full text-left text-[12px] underline underline-offset-2 opacity-80 hover:opacity-100">
                            Show hints as I play
                        </button>
                    )}
                </div>
            </Bubble>,
            document.body,
        );
    }

    const retire = (id: string) => {
        if (id === HINTS_OFF_HINT.id) {
            writeHintsOffTold();
            setOffTold(true);
            return;
        }
        setRetired([...retired, id]);
        retireHelperHint(gameId, id);
    };
    const hide = () => {
        writeHintsOff(true);
        setOff(true);
    };

    const callouts = shown.filter(hint => placements[hint.id]);
    if (callouts.length === 0) return null;
    return createPortal(
        callouts.map(hint => (
            <Bubble key={hint.id} placement={placements[hint.id]} width={CALLOUT_WIDTH}>
                <div data-helper-hint={hint.id}>
                    <p className="m-0 text-[13px] leading-[1.45] font-medium">{hint.text}</p>
                    <div className="mt-2 flex items-center justify-between text-[12px]">
                        {hint.id === HINTS_OFF_HINT.id ? <span /> : <button type="button" onClick={hide} className={quietButton}>Hide hints</button>}
                        <button type="button" onClick={() => retire(hint.id)} className={solidButton}>Got it</button>
                    </div>
                </div>
            </Bubble>
        )),
        document.body,
    );
}
