'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { AvatarDraftState, AvatarFraming, SCENE_WELCOME_KEY } from '@/app/api/game-models';
import { circleFocus } from '@/app/utils/avatar-framing';
import PlayerAvatar from '@/app/components/PlayerAvatar';

/** One portrait slot in the preview's cast grid. */
export interface CastEntry {
    key: string;   // portrait doc key (sanitized name, or the GM key)
    name: string;  // caption
    kind: 'bot' | 'you' | 'gm';
}

interface IllustrationsPanelProps {
    // null = nothing drawn yet for this preview
    draft: AvatarDraftState | null;
    cast: CastEntry[];
    // The set was drawn for different names than the preview has now; it
    // won't be attached to the game unless redrawn.
    castChanged: boolean;
    // A request is in flight (click → claim). Distinct from draft.status ===
    // 'generating', which is the server-side draw.
    busy: boolean;
    error: string | null;
    onGenerate: () => void;
    // Free tier: the block is shown locked with an upgrade link instead of
    // the draw button (free games draw their own set when they start).
    locked?: boolean;
    upgradeHref?: string;
    // Overrides the authed draft-image route for portraits and the scene
    // (design previews can't reach it; the app never passes this).
    imageUrlFn?: (key: string) => string;
    // When set, drawn portraits become clickable and open the character's
    // crop editor. Absent while the draft doesn't match the current cast — a
    // renamed character has no portrait to show.
    onPortraitClick?: (entry: CastEntry) => void;
}

/** URL of a draft image, cache-busted per key. */
export function draftImageUrl(draft: AvatarDraftState, key: string): string {
    return `/api/avatar-drafts/${encodeURIComponent(key)}?v=${draft.avatarVersions[key] ?? draft.version}`;
}

/** The framing of the portrait currently shown for a key, if the candidate
 * was cut from a kept sheet (older drafts have none and can't be reframed). */
export function draftFraming(draft: AvatarDraftState, key: string): { index: number; framing: AvatarFraming; initial: AvatarFraming } | undefined {
    const entry = draft.avatarVariants[key];
    if (!entry || entry.sel < 0) return undefined;
    const framing = entry.framing?.[String(entry.sel)];
    if (!framing) return undefined;
    return { index: entry.sel, framing, initial: entry.drawn?.[String(entry.sel)] ?? framing };
}

const captionColor = (kind: CastEntry['kind']) =>
    kind === 'gm' ? 'text-[var(--gm-fg)]' : kind === 'you' ? 'text-[var(--you-fg)]' : 'text-[var(--fg-2)]';

const MONO_LABEL = 'text-[10px] font-mono uppercase tracking-[0.08em] text-[var(--fg-2)]';

const PaidBadge = ({ muted = false }: { muted?: boolean }) => (
    <span className={`text-[10px] font-mono font-bold tracking-[0.1em] px-[5px] py-px rounded-[5px] border ${
        muted ? 'text-[var(--fg-3)] bg-[var(--bg-2)] border-[var(--line-2)]' : 'text-[var(--accent)] bg-[var(--accent-soft)] border-[var(--accent-line)]'}`}>
        PAID
    </span>
);

const RefreshIcon = ({ spinning = false }: { spinning?: boolean }) => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={spinning ? 'animate-spin' : ''}>
        <polyline points="23 4 23 10 17 10" />
        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
);

const SparkleIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
    </svg>
);

const Spinner = ({ size = 16 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" className="animate-spin flex-shrink-0">
        <path d="M10 2a8 8 0 0 1 8 8" />
    </svg>
);

/**
 * Paid-tier block on the new-game preview: draws the opening-scene
 * illustration and every character portrait in one action, shows them as
 * they land, and offers a redraw once drawn. Every portrait comes from one
 * drawn sheet, so clicking one opens its crop editor rather than a card. The
 * set lives in the user's illustration draft until createGame adopts it.
 * @category Game
 */
export default function IllustrationsPanel({ draft, cast, castChanged, busy, error, onGenerate, locked = false, upgradeHref = '/profile', imageUrlFn, onPortraitClick }: IllustrationsPanelProps) {
    const [sceneFailed, setSceneFailed] = useState(false);
    const imgUrl = (key: string) => imageUrlFn ? imageUrlFn(key) : draftImageUrl(draft!, key);
    const drawing = draft?.status === 'generating';
    const drawn = draft?.status === 'ready';
    const stages = draft?.stages ?? { portraits: false, scene: false };
    // Two whole-image stages (grid, scene pair), drawn in parallel — the bar
    // moves per stage, with a little headroom so it never sits at zero.
    const progress = 0.08 + (stages.portraits ? 0.46 : 0) + (stages.scene ? 0.46 : 0);
    const canClick = !busy && !drawing;
    const portraitCount = cast.length;

    if (locked) {
        return (
            <div className="px-[18px] py-4 bg-[var(--bg-1)] border border-[var(--line-1)] rounded-[var(--radius-lg)] flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2.5 flex-[1_1_280px] min-w-0">
                    <span className="w-[34px] h-[34px] flex-none rounded-[var(--radius-md)] bg-[var(--bg-2)] border border-[var(--line-2)] grid place-items-center text-[var(--fg-3)]">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
                    </span>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <span className="text-[13px] font-semibold text-[var(--fg-2)]">Illustrations</span>
                            <PaidBadge muted />
                        </div>
                        <div className="text-[12px] text-[var(--fg-3)] [text-wrap:pretty]">On the free tier the game draws its own set when it starts — you just can&rsquo;t direct it here.</div>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <button type="button" disabled className="px-3.5 py-[9px] text-[13px] font-medium rounded-[var(--radius-md)] bg-[var(--bg-3)] border border-[var(--line-2)] text-[var(--fg-3)] cursor-not-allowed whitespace-nowrap">
                        Draw the cast
                    </button>
                    <Link href={upgradeHref} className="text-[12px] font-medium text-[var(--accent)] hover:text-[var(--accent-text)] whitespace-nowrap">Upgrade</Link>
                </div>
            </div>
        );
    }

    if (!drawing && !drawn) {
        return (
            <div className="px-[18px] py-4 bg-[var(--bg-1)] border border-[var(--line-1)] rounded-[var(--radius-lg)] flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2.5 flex-[1_1_280px] min-w-0">
                    <span className="w-[34px] h-[34px] flex-none rounded-[var(--radius-md)] bg-[var(--accent-soft)] border border-[var(--accent-line)] grid place-items-center text-[var(--accent)]">
                        <SparkleIcon />
                    </span>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <span className="text-[13px] font-semibold text-[var(--fg-0)]">Illustrations</span>
                            <PaidBadge />
                        </div>
                        <div className="text-[12px] text-[var(--fg-2)] [text-wrap:pretty]">{portraitCount} portraits and the opening scene, in your art style · about 30s</div>
                        {(error || draft?.error) && <div className="mt-1 text-[12px] text-[var(--danger)]">{error ?? draft?.error}</div>}
                    </div>
                </div>
                <button
                    type="button"
                    onClick={onGenerate}
                    disabled={!canClick}
                    className="flex items-center gap-2 px-3.5 py-[9px] text-[13px] font-medium rounded-[var(--radius-md)] bg-[var(--accent)] text-[var(--accent-fg)] hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap transition-all duration-[120ms]"
                >
                    {busy && <Spinner size={14} />}
                    Draw the cast
                </button>
            </div>
        );
    }

    return (
        <div>
            {/* Section header */}
            <div className="flex items-center gap-2.5 flex-wrap mb-2.5">
                <h3 className="m-0 text-[15px] font-semibold text-[var(--fg-0)]">Illustrations</h3>
                <PaidBadge />
                <span className="flex-1 h-px bg-[var(--line-1)] min-w-[20px]" />
                {drawn && (
                    <button
                        type="button"
                        onClick={onGenerate}
                        disabled={!canClick}
                        className="flex items-center gap-[7px] px-[11px] py-1.5 text-[12px] font-medium rounded-[var(--radius-md)] bg-[var(--bg-3)] border border-[var(--line-3)] text-[var(--fg-1)] hover:bg-[var(--bg-4)] hover:text-[var(--fg-0)] disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap transition-all duration-[120ms]"
                    >
                        <RefreshIcon spinning={busy} />
                        Redraw everything
                    </button>
                )}
            </div>

            {/* Body card */}
            <div className="px-[18px] py-4 bg-[var(--bg-1)] border border-[var(--line-1)] rounded-[var(--radius-lg)] flex flex-col gap-3.5">
                {drawing ? (
                    <>
                        <div className="flex items-center gap-2.5 flex-wrap">
                            <Spinner />
                            <span className="text-[13px] font-medium text-[var(--fg-0)]">Drawing the cast…</span>
                            <span className="text-[11px] font-mono text-[var(--fg-2)]">
                                {portraitCount} portraits{stages.portraits ? ' ✓' : ''} · scene {stages.scene ? '✓' : 'queued'}
                            </span>
                            <span className="flex-1" />
                            <span className="text-[12px] text-[var(--fg-3)]">You can keep editing the preview.</span>
                        </div>
                        <div className="h-[3px] rounded-[2px] bg-[var(--bg-3)] overflow-hidden">
                            <div className="h-full bg-[var(--accent)] transition-[width] duration-700 ease-out" style={{ width: `${Math.round(progress * 100)}%` }} />
                        </div>
                        <div className="flex gap-[22px] items-start flex-wrap">
                            <div className="flex-[1_1_320px] min-w-0">
                                <div className={`${MONO_LABEL} mb-2`}>Opening scene</div>
                                <div className="w-full max-w-[400px] aspect-video rounded-[8px] bg-[var(--bg-2)] border border-[var(--line-2)] animate-shimmer" />
                            </div>
                            <div className="flex-[1_1_300px] min-w-0">
                                <div className={`${MONO_LABEL} mb-2`}>Portraits · {portraitCount}</div>
                                <div className="grid grid-cols-[repeat(auto-fit,minmax(56px,1fr))] gap-x-2.5 gap-y-3">
                                    {cast.map(entry => (
                                        <div key={entry.key} className="w-[46px] h-[46px] rounded-full bg-[var(--bg-2)] border border-[var(--line-2)] animate-shimmer justify-self-center" />
                                    ))}
                                </div>
                            </div>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="flex gap-[22px] items-start flex-wrap">
                            <div className="flex-[1_1_320px] min-w-0">
                                <div className={`${MONO_LABEL} mb-2`}>Opening scene</div>
                                {draft!.hasScene && !sceneFailed ? (
                                    // eslint-disable-next-line @next/next/no-img-element -- authed dynamic route; next/image can't optimize it
                                    <img
                                        src={imageUrlFn ? imageUrlFn(SCENE_WELCOME_KEY) : `/api/avatar-drafts/${SCENE_WELCOME_KEY}?v=${draft!.version}`}
                                        alt="Opening scene"
                                        width={400}
                                        height={225}
                                        className="w-full max-w-[400px] aspect-video object-cover rounded-[8px] bg-[var(--bg-2)] block"
                                        onError={() => setSceneFailed(true)}
                                    />
                                ) : (
                                    <div className="w-full max-w-[400px] aspect-video rounded-[8px] bg-[var(--bg-2)] border border-[var(--line-2)] flex items-center justify-center text-[12px] text-[var(--fg-3)]">
                                        The scene didn&rsquo;t come out &mdash; redraw to try again.
                                    </div>
                                )}
                            </div>
                            <div className="flex-[1_1_300px] min-w-0">
                                <div className={`${MONO_LABEL} mb-2`}>Portraits · {portraitCount}</div>
                                <div className="grid grid-cols-[repeat(auto-fit,minmax(56px,1fr))] gap-x-2.5 gap-y-3">
                                    {cast.map(entry => {
                                        const framing = draft && !imageUrlFn ? draftFraming(draft, entry.key) : undefined;
                                        const portrait = imageUrlFn ? (
                                            // eslint-disable-next-line @next/next/no-img-element -- design-kit override
                                            <img src={imgUrl(entry.key)} alt={entry.name} width={46} height={46} className="w-[46px] h-[46px] rounded-full object-cover bg-[var(--bg-2)] block" />
                                        ) : (
                                            <PlayerAvatar name={entry.name} size={46} isGM={entry.kind === 'gm'} avatarUrl={imgUrl(entry.key)} focus={framing ? circleFocus(framing.framing.circle) : undefined} />
                                        );
                                        return (
                                            <div key={entry.key} className="flex flex-col items-center gap-1 min-w-0">
                                                {onPortraitClick ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => onPortraitClick(entry)}
                                                        aria-label={`Reframe ${entry.name}'s portrait`}
                                                        title={`Reframe ${entry.name}'s portrait`}
                                                        className="p-0 border-none bg-transparent rounded-full cursor-pointer transition-all duration-[120ms] hover:scale-[1.08] hover:shadow-[0_0_0_2px_var(--accent)] focus-visible:shadow-[0_0_0_2px_var(--accent)] outline-none"
                                                    >
                                                        {portrait}
                                                    </button>
                                                ) : portrait}
                                                <span className={`text-[10px] leading-[1.2] text-center truncate max-w-full ${captionColor(entry.kind)}`}>{entry.name}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                        <p className="m-0 text-[12px] leading-[1.5] text-[var(--fg-3)]">
                            All portraits come from one drawn sheet &mdash; click any of them to move its crop frame. Redrawing keeps the old set, and every character can be switched back on their card.
                        </p>
                        {castChanged && (
                            <p className="m-0 text-[12px] leading-[1.5] text-[var(--fg-2)]">
                                Names changed since these were drawn. Redraw to match the new cast &mdash; otherwise the game draws a fresh set when it starts.
                            </p>
                        )}
                        {error && <p className="m-0 text-[12px] text-[var(--danger)]">{error}</p>}
                    </>
                )}
            </div>
        </div>
    );
}
