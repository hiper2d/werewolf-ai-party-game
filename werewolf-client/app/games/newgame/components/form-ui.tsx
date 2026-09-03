'use client';

import React, { useState } from 'react';

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

/** The "?" hint: a popover that opens on hover and toggles on click (touch). */
export function InfoButton({ label, children, size = 20, align = 'left' }: { label: string; children: React.ReactNode; size?: number; align?: 'left' | 'right' }) {
    const [open, setOpen] = useState(false);
    return (
        <span className="relative inline-flex items-center">
            <button
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
            {open && (
                <span className={`absolute z-10 w-64 sm:w-72 p-3 bg-[var(--bg-1)] border border-[var(--line-2)] rounded-[var(--radius-lg)] shadow-pop text-[13px] text-[var(--fg-1)] top-full mt-2 ${align === 'right' ? 'right-0' : 'left-0'}`}>
                    {children}
                </span>
            )}
        </span>
    );
}

/** Two-way pill toggle (Role-play | Plain, Short | Long). */
export function SegmentedControl<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (value: T) => void }) {
    return (
        <span className="flex bg-[var(--bg-2)] border border-[var(--line-2)] rounded-[var(--radius-md)] p-[2px]">
            {options.map(o => (
                <button
                    key={o.value}
                    type="button"
                    aria-pressed={o.value === value}
                    onClick={() => onChange(o.value)}
                    className={`px-3 py-[5px] rounded-[6px] text-[12px] font-medium whitespace-nowrap transition-all duration-[120ms] ${
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
