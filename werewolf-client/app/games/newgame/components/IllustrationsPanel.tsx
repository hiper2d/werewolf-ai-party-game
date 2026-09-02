'use client';

import React, { useState } from 'react';
import { AvatarDraftState, SCENE_WELCOME_KEY } from '@/app/api/game-models';

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
    // Overrides the authed draft-image route for portraits and the scene
    // (design previews can't reach it; the app never passes this).
    imageUrlFn?: (key: string) => string;
    // When set, drawn portraits become clickable and open the character's
    // card (same card the game shows). Absent while the draft doesn't match
    // the current cast — a renamed character has no portrait to show.
    onPortraitClick?: (entry: CastEntry) => void;
}

/** URL of a draft image, cache-busted per key. */
export function draftImageUrl(draft: AvatarDraftState, key: string): string {
    return `/api/avatar-drafts/${encodeURIComponent(key)}?v=${draft.avatarVersions[key] ?? draft.version}`;
}

const captionColor = (kind: CastEntry['kind']) =>
    kind === 'gm' ? 'text-[var(--gm-fg)]' : kind === 'you' ? 'text-[var(--you-fg)]' : 'text-[var(--fg-2)]';

const MONO_LABEL = 'text-[10px] font-mono uppercase tracking-[0.08em] text-[var(--fg-2)]';

const RefreshIcon = ({ spinning = false }: { spinning?: boolean }) => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={spinning ? 'animate-spin' : ''}>
        <polyline points="23 4 23 10 17 10" />
        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
);

const Spinner = ({ size = 16 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" className="animate-spin flex-shrink-0">
        <path d="M10 2a8 8 0 0 1 8 8" />
    </svg>
);

/**
 * Paid-tier block at the top of the new-game preview: draws the opening-scene
 * illustration and every character portrait in one action, shows them as they
 * land, and offers a redraw once drawn. The set lives in the user's
 * illustration draft until createGame adopts it.
 * @category Game
 */
export default function IllustrationsPanel({ draft, cast, castChanged, busy, error, onGenerate, imageUrlFn, onPortraitClick }: IllustrationsPanelProps) {
    const [sceneFailed, setSceneFailed] = useState(false);
    const imgUrl = (key: string) => imageUrlFn ? imageUrlFn(key) : draftImageUrl(draft!, key);
    const drawing = draft?.status === 'generating';
    const drawn = draft?.status === 'ready';
    const stages = draft?.stages ?? { portraits: false, scene: false };
    // Two whole-image stages (grid, scene pair), drawn in parallel — the bar
    // moves per stage, with a little headroom so it never sits at zero.
    const progress = 0.08 + (stages.portraits ? 0.46 : 0) + (stages.scene ? 0.46 : 0);
    const canClick = !busy && !drawing;

    return (
        <div>
            {/* Section header */}
            <div className="flex items-center gap-2.5 mb-3">
                <h3 className="text-[15px] font-semibold text-[var(--fg-0)]">Illustrations</h3>
                <span className="text-[10px] font-mono font-bold tracking-[0.1em] px-1.5 py-0.5 rounded-[5px] text-[var(--accent)] bg-[var(--accent-soft)] border border-[var(--accent-line)]">PAID</span>
                <span className="flex-1 h-px bg-[var(--line-1)]" />
                {drawn && (
                    <button
                        type="button"
                        onClick={onGenerate}
                        disabled={!canClick}
                        className="flex items-center gap-[7px] px-[11px] py-1.5 text-[12px] font-medium rounded-[var(--radius-md)] bg-[var(--bg-3)] border border-[var(--line-3)] text-[var(--fg-1)] hover:bg-[var(--bg-4)] hover:text-[var(--fg-0)] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-[120ms]"
                    >
                        <RefreshIcon spinning={busy} />
                        Redraw everything
                    </button>
                )}
            </div>

            {/* Body card */}
            <div className="px-[18px] py-4 bg-[var(--bg-1)] border border-[var(--line-1)] rounded-[var(--radius-lg)]">
                {drawing ? (
                    <div className="flex flex-col gap-3.5">
                        <div className="flex items-center gap-2.5 flex-wrap">
                            <Spinner />
                            <span className="text-[13px] font-medium text-[var(--fg-0)]">Drawing the cast…</span>
                            <span className="text-[11px] font-mono text-[var(--fg-2)]">
                                {cast.length} portraits{stages.portraits ? ' ✓' : ''} · scene {stages.scene ? '✓' : 'queued'}
                            </span>
                            <span className="flex-1" />
                            <span className="text-[12px] text-[var(--fg-3)]">You can keep editing the preview.</span>
                        </div>
                        <div className="h-[3px] rounded-[2px] bg-[var(--bg-3)] overflow-hidden">
                            <div className="h-full bg-[var(--accent)] transition-[width] duration-700 ease-out" style={{ width: `${Math.round(progress * 100)}%` }} />
                        </div>
                        <div className="flex gap-6 items-start flex-wrap">
                            <div className="w-[400px] max-w-full aspect-video rounded-[8px] bg-[var(--bg-2)] border border-[var(--line-2)] animate-shimmer" />
                            <div className="flex-1 min-w-[240px] grid grid-cols-6 gap-x-2.5 gap-y-3">
                                {cast.map(entry => (
                                    <div key={entry.key} className="w-[46px] h-[46px] rounded-full bg-[var(--bg-2)] border border-[var(--line-2)] animate-shimmer justify-self-center" />
                                ))}
                            </div>
                        </div>
                    </div>
                ) : drawn ? (
                    <div className="flex flex-col gap-3.5">
                        <div className="flex gap-[22px] items-start flex-wrap">
                            <div>
                                <div className={`${MONO_LABEL} mb-2`}>Opening scene</div>
                                {draft.hasScene && !sceneFailed ? (
                                    // eslint-disable-next-line @next/next/no-img-element -- authed dynamic route; next/image can't optimize it
                                    <img
                                        src={imageUrlFn ? imageUrlFn(SCENE_WELCOME_KEY) : `/api/avatar-drafts/${SCENE_WELCOME_KEY}?v=${draft.version}`}
                                        alt="Opening scene"
                                        width={400}
                                        height={225}
                                        className="w-[400px] max-w-full aspect-video object-cover rounded-[8px] bg-[var(--bg-2)]"
                                        onError={() => setSceneFailed(true)}
                                    />
                                ) : (
                                    <div className="w-[400px] max-w-full aspect-video rounded-[8px] bg-[var(--bg-2)] border border-[var(--line-2)] flex items-center justify-center text-[12px] text-[var(--fg-3)]">
                                        The scene didn’t come out — redraw to try again.
                                    </div>
                                )}
                            </div>
                            <div className="flex-1 min-w-[240px]">
                                <div className={`${MONO_LABEL} mb-2`}>Portraits · {cast.length}</div>
                                <div className="grid grid-cols-6 gap-x-2.5 gap-y-3">
                                    {cast.map(entry => (
                                        <div key={entry.key} className="flex flex-col items-center gap-1 min-w-0">
                                            {onPortraitClick ? (
                                                <button
                                                    type="button"
                                                    onClick={() => onPortraitClick(entry)}
                                                    aria-label={`View ${entry.name}'s card`}
                                                    title={`View ${entry.name}'s card`}
                                                    className="rounded-full transition-all duration-[120ms] hover:scale-[1.08] hover:shadow-[0_0_0_2px_var(--accent)] focus-visible:shadow-[0_0_0_2px_var(--accent)] outline-none"
                                                >
                                                    {/* eslint-disable-next-line @next/next/no-img-element -- authed dynamic route */}
                                                    <img
                                                        src={imgUrl(entry.key)}
                                                        alt={entry.name}
                                                        width={46}
                                                        height={46}
                                                        className="w-[46px] h-[46px] rounded-full object-cover bg-[var(--bg-2)] block"
                                                    />
                                                </button>
                                            ) : (
                                                // eslint-disable-next-line @next/next/no-img-element -- authed dynamic route
                                                <img
                                                    src={imgUrl(entry.key)}
                                                    alt={entry.name}
                                                    width={46}
                                                    height={46}
                                                    className="w-[46px] h-[46px] rounded-full object-cover bg-[var(--bg-2)]"
                                                />
                                            )}
                                            <span className={`text-[10px] leading-tight text-center truncate max-w-full ${captionColor(entry.kind)}`}>{entry.name}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <p className="m-0 text-[12px] leading-[1.5] text-[var(--fg-3)]">
                            Redrawing keeps the old set — every character can be switched back on their card.
                        </p>
                        {castChanged && (
                            <p className="m-0 text-[12px] leading-[1.5] text-[var(--fg-2)]">
                                Names changed since these were drawn. Redraw to match the new cast — otherwise the game draws a fresh set when it starts.
                            </p>
                        )}
                        {error && <p className="m-0 text-[12px] text-[var(--danger)]">{error}</p>}
                    </div>
                ) : (
                    <div className="flex items-start gap-6 flex-wrap">
                        <div className="flex-1 min-w-[240px]">
                            <p className="m-0 text-[13px] leading-[1.55] text-[var(--fg-1)] [text-wrap:pretty]">
                                Draw a portrait for every character and an illustration of the opening scene, in the art style above. Nothing is drawn until you ask — names, models and stories stay editable afterwards.
                            </p>
                            <p className="m-0 mt-1.5 text-[12px] text-[var(--fg-3)]">Takes about half a minute. You can start the game while it finishes.</p>
                            {(error || draft?.error) && <p className="m-0 mt-2 text-[12px] text-[var(--danger)]">{error ?? draft?.error}</p>}
                        </div>
                        <button
                            type="button"
                            onClick={onGenerate}
                            disabled={!canClick}
                            className="flex items-center gap-2 px-3.5 py-[9px] text-[13px] font-medium rounded-[var(--radius-md)] bg-[var(--accent)] text-[var(--accent-fg)] hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-[120ms]"
                        >
                            {busy ? <Spinner size={14} /> : (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
                                </svg>
                            )}
                            Generate illustrations
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
