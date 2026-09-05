'use client';

import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/** Small building blocks the new-game form and its preview share. */

export const inputStyle = "w-full px-3 py-2 rounded-[var(--radius-md)] bg-[var(--bg-2)] border border-[var(--line-2)] text-[var(--fg-0)] text-[13px] placeholder:text-[var(--fg-3)] focus:outline-none focus:border-[var(--accent-line)] focus:shadow-[0_0_0_3px_var(--accent-soft)] transition-all duration-[120ms]";
// Inputs inside an expanded cast row sit on bg-2, so they step down a level.
export const nestedInputStyle = inputStyle.replace('bg-[var(--bg-2)]', 'bg-[var(--bg-1)]');
export const labelStyle = "block mb-1.5 text-[12px] font-medium text-[var(--fg-1)]";
export const monoLabel = "font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--fg-2)]";
export const monoMeta = "font-mono text-[11px] text-[var(--fg-3)]";
export const secondaryButton = "px-3.5 py-[7px] text-[12px] font-medium rounded-[var(--radius-md)] bg-[var(--bg-3)] border border-[var(--line-3)] text-[var(--fg-1)] hover:bg-[var(--bg-4)] hover:text-[var(--fg-0)] whitespace-nowrap transition-all duration-[120ms] disabled:opacity-50 disabled:cursor-not-allowed";
export const primaryButton = "px-4 py-[7px] text-[12px] font-semibold rounded-[var(--radius-md)] bg-[var(--accent)] text-[var(--accent-fg)] hover:brightness-110 whitespace-nowrap transition-all duration-[120ms] disabled:opacity-50 disabled:cursor-not-allowed";
export const iconButton = "w-8 h-8 rounded-[var(--radius-md)] bg-[var(--bg-3)] border border-[var(--line-2)] text-[var(--fg-1)] hover:bg-[var(--bg-4)] hover:text-[var(--fg-0)] transition-all duration-[120ms] flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed";

/** The "?" hint: a popover that opens on hover and toggles on click (touch).
 *  Rendered in a portal with fixed positioning so it flips above the button and
 *  clamps to the viewport instead of running off the bottom or the sides. */
export function InfoButton({ label, children, size = 20, align = 'left' }: { label: string; children: React.ReactNode; size?: number; align?: 'left' | 'right' }) {
    const [open, setOpen] = useState(false);
    const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const popoverRef = useRef<HTMLSpanElement>(null);

    const place = useCallback(() => {
        const button = buttonRef.current, popover = popoverRef.current;
        if (!button || !popover) return;
        const rect = button.getBoundingClientRect();
        const { offsetWidth: width, offsetHeight: height } = popover;
        const margin = 8, gap = 8;
        // Below the button by default; above it when that would overflow the bottom.
        let top = rect.bottom + gap;
        if (top + height > window.innerHeight - margin) {
            const above = rect.top - gap - height;
            top = above >= margin ? above : Math.max(margin, window.innerHeight - margin - height);
        }
        let left = align === 'right' ? rect.right - width : rect.left;
        left = Math.min(Math.max(margin, left), Math.max(margin, window.innerWidth - margin - width));
        setPos({ top, left });
    }, [align]);

    useLayoutEffect(() => {
        if (!open) { setPos(null); return; }
        place();
        // Follow the button while anything under it scrolls, and on resize.
        window.addEventListener('scroll', place, true);
        window.addEventListener('resize', place);
        return () => {
            window.removeEventListener('scroll', place, true);
            window.removeEventListener('resize', place);
        };
    }, [open, place]);

    return (
        <span className="relative inline-flex items-center">
            <button
                ref={buttonRef}
                type="button"
                aria-label={label}
                className="flex-none rounded-full bg-[var(--bg-3)] border border-[var(--line-2)] text-[var(--fg-2)] hover:bg-[var(--bg-4)] hover:text-[var(--fg-0)] transition-all duration-[120ms] grid place-items-center text-[11px] font-medium leading-none"
                style={{ width: size, height: size, fontSize: size < 18 ? 10 : 11 }}
                onMouseEnter={() => setOpen(true)}
                onMouseLeave={() => setOpen(false)}
                onClick={(e) => { e.preventDefault(); setOpen(o => !o); }}
            >
                ?
            </button>
            {open && typeof document !== 'undefined' && createPortal(
                <span
                    ref={popoverRef}
                    className="fixed z-50 w-64 sm:w-72 max-w-[calc(100vw-16px)] max-h-[70vh] overflow-y-auto p-3 bg-[var(--bg-1)] border border-[var(--line-2)] rounded-[var(--radius-lg)] shadow-pop text-[13px] text-[var(--fg-1)] pointer-events-none"
                    style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, visibility: pos ? 'visible' : 'hidden' }}
                >
                    {children}
                </span>,
                document.body
            )}
        </span>
    );
}

/** Two-way pill toggle (Role-play | Plain, Short | Long). */
export function SegmentedControl<T extends string>({ value, options, onChange, disabled = false }: { value: T; options: { value: T; label: string }[]; onChange: (value: T) => void; disabled?: boolean }) {
    return (
        <span className={`flex bg-[var(--bg-2)] border border-[var(--line-2)] rounded-[var(--radius-md)] p-[2px] ${disabled ? 'opacity-60' : ''}`}>
            {options.map(o => (
                <button
                    key={o.value}
                    type="button"
                    aria-pressed={o.value === value}
                    disabled={disabled}
                    onClick={() => onChange(o.value)}
                    className={`px-3 py-[5px] rounded-[6px] text-[12px] font-medium whitespace-nowrap transition-all duration-[120ms] disabled:cursor-not-allowed ${
                        o.value === value ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'bg-transparent text-[var(--fg-2)] hover:text-[var(--fg-0)]'}`}
                >
                    {o.label}
                </button>
            ))}
        </span>
    );
}

export const PlayIcon = ({ playing }: { playing: boolean }) => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><path d={playing ? 'M3 3h8v8H3z' : 'M4 2.5l8 4.5-8 4.5z'} /></svg>
);

export const ChevronIcon = ({ rotated = false }: { rotated?: boolean }) => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="transition-transform duration-[160ms]" style={{ transform: rotated ? 'rotate(180deg)' : 'none' }}>
        <path d="M3.5 5.25L7 8.75L10.5 5.25" />
    </svg>
);

// 12 evenly spaced hues skipping the banned 270°–345° purple/magenta arc
const AVATAR_HUES = [350, 14, 38, 62, 86, 110, 134, 158, 182, 206, 230, 254];

export function avatarHue(name: string): number {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return AVATAR_HUES[h % AVATAR_HUES.length];
}

/** Initial-letter circle for a character with no portrait yet. */
export function InitialAvatar({ name, size = 28 }: { name: string; size?: number }) {
    return (
        <span
            style={{ '--h': avatarHue(name), width: size, height: size, fontSize: Math.round(size * 0.43) } as React.CSSProperties}
            className="flex-none rounded-full grid place-items-center font-semibold bg-[linear-gradient(150deg,oklch(42%_0.075_var(--h)),oklch(31%_0.055_var(--h)))] text-[oklch(88%_0.06_var(--h))]"
        >
            {name.charAt(0).toUpperCase()}
        </span>
    );
}

/** Short row blurb: the story's first sentence, cut to fit. */
export function storyBlurb(story: string, max = 90): string {
    const first = story.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? story;
    const text = first.trim();
    return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

export function playStyleLabel(style: string): string {
    return style.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}
