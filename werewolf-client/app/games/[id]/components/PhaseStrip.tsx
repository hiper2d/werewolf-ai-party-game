'use client';

import React from 'react';
import PlayerAvatar from '@/app/components/PlayerAvatar';
import type { AvatarView } from '@/app/utils/avatar-utils';

/**
 * Footer strip vocabulary for the chat (design: "Phase Controls", 1a + 2a).
 *
 * The composer's footer strip never disappears — when the composer is disabled it
 * is replaced, in the same chrome, by one of:
 *   - <LoadingRail>  actor on the left, plain-language label, 3px track, mono counter
 *   - <PhaseBar>     phase context on the left, the flow action(s) on the right
 * In-stream busy states (loading a day, deleting) use the centred <StreamPill>.
 */

// ── Buttons ────────────────────────────────────────────────────────────────

/** Primary flow action: accent fill, icon + label, 38px tall. */
export const btnFlowPrimary =
    'inline-flex items-center gap-2 h-[38px] px-4 rounded-[var(--radius-md)] border border-transparent bg-[var(--accent)] text-[var(--on-accent)] text-[13.5px] font-semibold tracking-[-0.005em] transition-[filter,transform] duration-[120ms] hover:brightness-110 hover:-translate-y-px active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:brightness-100 disabled:hover:translate-y-0';
export const btnFlowPrimaryStyle: React.CSSProperties = {
    boxShadow: '0 1px 0 rgba(255,255,255,0.10) inset, 0 6px 18px -8px oklch(72% 0.09 230 / 0.7)',
};

/** Same footprint as the primary, danger fill (Game Over, Exit Game). */
export const btnFlowDanger =
    'inline-flex items-center gap-2 h-[38px] px-4 rounded-[var(--radius-md)] border border-transparent bg-[var(--danger)] text-white text-[13.5px] font-semibold tracking-[-0.005em] transition-[filter,transform] duration-[120ms] hover:brightness-110 hover:-translate-y-px active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:brightness-100 disabled:hover:translate-y-0';

/** Secondary flow action: outlined, quiet (Replay Night). */
export const btnFlowSecondary =
    'inline-flex items-center gap-[7px] h-[38px] px-[13px] rounded-[var(--radius-md)] border border-[var(--line-2)] bg-transparent text-[var(--fg-1)] text-[13px] font-medium transition-[color,border-color,background] duration-[120ms] hover:text-[var(--fg-0)] hover:border-[var(--line-3)] hover:bg-[var(--bg-2)] disabled:opacity-50 disabled:cursor-not-allowed';

/** Compact cancel used inside the loading rail. */
export const btnRailCancel =
    'h-7 px-[11px] rounded-[var(--radius-md)] border border-[var(--line-2)] bg-transparent text-[var(--fg-2)] text-[12px] font-medium transition-[color,border-color] duration-[120ms] hover:text-[var(--danger)] hover:border-[var(--danger-line)] flex-none';

// ── Icons ──────────────────────────────────────────────────────────────────

export function MoonIcon({ size = 15 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
    );
}

export function SunriseIcon({ size = 15 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="14" r="4" />
            <path d="M12 5V3M5.5 7.5 4 6M18.5 7.5 20 6M3 18h18" />
        </svg>
    );
}

export function ReplayIcon({ size = 14 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 12a9 9 0 1 0 3-6.7" />
            <path d="M3 4.5V9h4.5" />
        </svg>
    );
}

export function MaskIcon({ size = 15 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 5c2.5-1.2 5.3-1.8 8-1.8S17.5 3.8 20 5v6.5c0 4.6-3.4 8.1-8 9.5-4.6-1.4-8-4.9-8-9.5V5z" />
            <path d="M8 10.5c.8-.6 1.7-.6 2.5 0M13.5 10.5c.8-.6 1.7-.6 2.5 0M9 15c1.8 1.3 4.2 1.3 6 0" />
        </svg>
    );
}

export function ExitIcon({ size = 15 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <path d="M16 17l5-5-5-5M21 12H9" />
        </svg>
    );
}

function ImageIcon({ size = 15 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <circle cx="8.5" cy="9.5" r="1.5" />
            <path d="m4 17 5-5 4 4 3-2 4 3" />
        </svg>
    );
}

function ArcSpinner({ color, size = 13 }: { color: string; size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" className="animate-spin flex-shrink-0" aria-hidden="true">
            <path d="M10 2a8 8 0 0 1 8 8" />
        </svg>
    );
}

// ── Strip chrome ───────────────────────────────────────────────────────────

/** The translucent footer chrome shared by the composer, the rail and the phase bar. */
export const stripChromeClass = 'flex-shrink-0 z-10 mt-1 border-t border-[var(--line-1)] backdrop-blur-[10px]';
export const stripChromeStyle: React.CSSProperties = { background: 'color-mix(in oklch, var(--bg-0) 78%, transparent)' };

// ── Loading rail ───────────────────────────────────────────────────────────

export type RailActor =
    | { kind: 'player'; name: string; avatar?: AvatarView; isGM?: boolean }
    | { kind: 'moon' }   // night action — the role stays hidden, no avatar
    | { kind: 'dot' }    // no actor yet (GM is choosing, day is starting)
    | { kind: 'art' };   // portraits / scenes are being drawn

export interface LoadingRailProps {
    actor: RailActor;
    /** Bold lead: the actor's name, or the whole sentence when there is no actor. */
    subject: string;
    /** Plain-language verb phrase after the subject ("is thinking"). */
    verb?: string;
    /** Known queue length → determinate track and a "done / total" counter. */
    progress?: { done: number; total: number; unit?: string };
    /** Override counter text on the right (e.g. "~30s"). */
    counter?: string;
    /** Bouncing dots after the label, for the open-ended waits. */
    dots?: boolean;
    /** Accent-tinted rail — reserved for art in progress. */
    tone?: 'default' | 'accent';
    /** Right-side control (Cancel). */
    trailing?: React.ReactNode;
    className?: string;
}

function BounceDots() {
    return (
        <span className="inline-flex gap-[3px] self-center" aria-hidden="true">
            {[0, 1, 2].map(i => (
                <span key={i} className="w-1 h-1 rounded-full bg-[var(--accent)] animate-bounce" style={{ animationDelay: `${i * 0.18}s`, animationDuration: '1.1s' }} />
            ))}
        </span>
    );
}

function RailActorChip({ actor, tone }: { actor: RailActor; tone: 'default' | 'accent' }) {
    if (actor.kind === 'player') {
        return (
            <span className="inline-flex w-7 h-7 rounded-full overflow-hidden border border-[var(--line-3)] flex-none rail-pulse">
                <PlayerAvatar name={actor.name} size={26} isGM={actor.isGM} avatarUrl={actor.avatar?.url} focus={actor.avatar?.focus} />
            </span>
        );
    }
    if (actor.kind === 'moon') {
        return (
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-full border border-[var(--line-2)] bg-[var(--bg-2)] text-[var(--fg-2)] flex-none">
                <MoonIcon size={14} />
            </span>
        );
    }
    if (actor.kind === 'art') {
        return (
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-full border border-[var(--accent-line)] bg-[var(--accent-soft)] text-[var(--accent-text)] flex-none">
                <ImageIcon />
            </span>
        );
    }
    return (
        <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full border flex-none ${tone === 'accent' ? 'border-[var(--accent-line)] bg-[var(--accent-soft)]' : 'border-[var(--line-2)] bg-[var(--bg-2)]'}`}>
            <span className="w-2 h-2 rounded-full bg-[var(--accent)] rail-pulse" style={{ boxShadow: '0 0 8px var(--accent-line)', animationDuration: '1.2s' }} />
        </span>
    );
}

export function LoadingRail({ actor, subject, verb, progress, counter, dots, tone = 'default', trailing, className = '' }: LoadingRailProps) {
    const determinate = !!progress && progress.total > 0;
    const pct = determinate ? Math.round((Math.max(0, progress!.done) / progress!.total) * 100) : 0;
    const counterText = counter ?? (determinate ? `${progress!.done} / ${progress!.total}${progress!.unit ? ` ${progress!.unit}` : ''}` : undefined);
    const accent = tone === 'accent';

    return (
        <div
            role="status"
            aria-live="polite"
            className={`flex items-center gap-3 px-4 pt-[11px] pb-[13px] lg:px-7 ${accent ? 'border-t border-[var(--accent-line)]' : ''} ${className}`}
            style={accent ? { background: 'color-mix(in oklch, var(--accent-soft) 55%, transparent)', marginTop: -1 } : undefined}
        >
            <RailActorChip actor={actor} tone={tone} />
            <div className="flex flex-col gap-[3px] min-w-0 flex-1">
                <div className={`flex items-baseline gap-1.5 text-[13px] flex-wrap ${accent ? 'text-[var(--accent-text)]' : 'text-[var(--fg-1)]'}`}>
                    <span className={`font-semibold ${accent ? '' : 'text-[var(--fg-0)]'} truncate max-w-full`}>{subject}</span>
                    {verb && <span>{verb}</span>}
                    {dots && <BounceDots />}
                </div>
                <div
                    className="relative h-[3px] rounded-full overflow-hidden"
                    style={{ background: accent ? 'color-mix(in oklch, var(--bg-0) 55%, transparent)' : 'var(--bg-3)' }}
                    role={determinate ? 'progressbar' : undefined}
                    aria-valuemin={determinate ? 0 : undefined}
                    aria-valuemax={determinate ? progress!.total : undefined}
                    aria-valuenow={determinate ? progress!.done : undefined}
                >
                    {determinate ? (
                        <div className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-[400ms] ease-out" style={{ width: `${pct}%`, boxShadow: '0 0 10px var(--accent-line)' }} />
                    ) : (
                        <span className="absolute inset-y-0 left-0 w-[28%] rounded-full rail-sweep" style={{ background: 'linear-gradient(90deg, transparent, var(--accent), transparent)' }} />
                    )}
                </div>
            </div>
            {counterText && (
                <span className="font-mono text-[11px] text-[var(--fg-2)] whitespace-nowrap flex-none">{counterText}</span>
            )}
            {trailing}
        </div>
    );
}

// ── Phase bar ──────────────────────────────────────────────────────────────

export type PhaseTone = 'amber' | 'good' | 'danger' | 'neutral';

export interface PhaseBarProps {
    tone: PhaseTone;
    /** Mono, uppercase phase context ("Day 1 · vote results"). */
    label: string;
    /** Optional sentence next to the label (why the game is over, read-only notice…). */
    note?: string;
    /** Flow action buttons, right-aligned. */
    children?: React.ReactNode;
    className?: string;
}

const phaseDot: Record<PhaseTone, React.CSSProperties> = {
    amber: { background: 'oklch(82% 0.10 85)', boxShadow: '0 0 9px oklch(80% 0.10 85 / 0.7)' },
    good: { background: 'var(--good-fg)', boxShadow: '0 0 9px var(--good-line)' },
    danger: { background: 'var(--danger)', boxShadow: '0 0 9px var(--danger-line)' },
    neutral: { background: 'var(--fg-3)' },
};

export function PhaseBar({ tone, label, note, children, className = '' }: PhaseBarProps) {
    return (
        <div className={`flex items-center gap-3.5 flex-wrap px-4 py-3 lg:px-7 ${className}`}>
            <div className="flex items-center gap-2 min-w-0">
                <span className="w-[7px] h-[7px] rounded-full flex-none" style={phaseDot[tone]} aria-hidden="true" />
                <span className="font-mono text-[10.5px] tracking-[0.13em] uppercase text-[var(--fg-2)] whitespace-nowrap">{label}</span>
                {note && <span className={`text-[12.5px] ${tone === 'danger' ? 'text-[var(--danger)]' : 'text-[var(--fg-2)]'} min-w-0`}>{note}</span>}
            </div>
            <div className="flex-1" />
            {children && <div className="flex items-center gap-2 flex-wrap">{children}</div>}
        </div>
    );
}

// ── In-stream pill ─────────────────────────────────────────────────────────

export function StreamPill({ tone = 'accent', children }: { tone?: 'accent' | 'danger'; children: React.ReactNode }) {
    return (
        <div className="flex justify-center py-3">
            <div
                role="status"
                className="inline-flex items-center gap-[9px] pl-[11px] pr-3.5 py-[7px] rounded-full border border-[var(--line-2)] text-[12.5px] text-[var(--fg-1)]"
                style={{ background: 'color-mix(in oklch, var(--bg-1) 88%, transparent)', boxShadow: 'var(--shadow-1)' }}
            >
                <ArcSpinner color={tone === 'danger' ? 'var(--danger)' : 'var(--accent)'} />
                <span>{children}</span>
            </div>
        </div>
    );
}
