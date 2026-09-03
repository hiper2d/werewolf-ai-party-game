'use client';

import React from 'react';
import type { PreviewProgress } from '@/app/ai/preview-generation';

interface GeneratingStatusProps {
    // null until the first poll lands (casting is assumed).
    progress: PreviewProgress | null;
}

const CheckIcon = () => (
    <svg width="12" height="12" viewBox="0 0 8 8" fill="none" stroke="var(--good-fg)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M1 4.2L3 6L7 1.6" /></svg>
);

/**
 * The preview pipeline's status card: casting the lobby first, then the
 * character sheets in batches, illustrations only on request afterwards.
 * @category Game
 */
export default function GeneratingStatus({ progress }: GeneratingStatusProps) {
    const sheets = progress?.stage === 'sheets';
    const total = progress?.batchesTotal ?? 0;
    const done = progress?.batchesDone ?? 0;
    const written = progress?.writtenNames.length ?? 0;
    const castSize = progress?.cast.length ?? 0;
    // Casting is the short first leg; the bar then walks the batches.
    const fraction = sheets && total > 0 ? 0.12 + 0.88 * (done / total) : 0.08;
    const currentBatch = Math.min(total, done + 1);

    return (
        <div className="px-[clamp(14px,3vw,20px)] py-[18px] bg-[var(--bg-1)] border border-[var(--accent-line)] rounded-[var(--radius-lg)] flex flex-col gap-3.5">
            <div className="flex items-center gap-2.5 flex-wrap">
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" className="animate-spin flex-none"><path d="M10 2a8 8 0 0 1 8 8" /></svg>
                <span className="text-[13px] font-semibold text-[var(--fg-0)]">{sheets ? 'Writing character sheets' : 'Casting the lobby'}</span>
                {sheets && total > 0 && (
                    <span className="font-mono text-[11px] text-[var(--fg-2)]">batch {currentBatch} of {total} · {written} of {castSize} done</span>
                )}
                <span className="flex-1" />
                <span className="text-[12px] text-[var(--fg-3)]">{sheets ? "You can keep editing what's already in." : 'The Game Master is choosing who sits at the table.'}</span>
            </div>
            <div className="h-[3px] rounded-[2px] bg-[var(--bg-3)] overflow-hidden">
                <div className="h-full bg-[var(--accent)] transition-[width] duration-700 ease-out" style={{ width: `${Math.round(fraction * 100)}%` }} />
            </div>
            <div className="flex gap-2.5 flex-wrap">
                {/* Story & cast */}
                <span className={`flex items-center gap-2 px-3 py-[7px] rounded-[var(--radius-md)] border text-[12px] font-medium ${
                    sheets ? 'bg-[var(--good-soft)] border-[var(--good-line)] text-[var(--good-fg)]' : 'bg-[var(--accent-soft)] border-[var(--accent-line)] text-[var(--accent)]'}`}>
                    {sheets ? <CheckIcon /> : <span className="w-3 h-3 rounded-full border-2 border-[var(--accent)] animate-pulse" />}
                    Story &amp; cast
                </span>
                {/* Character sheets */}
                <span className={`flex items-center gap-2 px-3 py-[7px] rounded-[var(--radius-md)] border text-[12px] font-medium ${
                    sheets ? 'bg-[var(--accent-soft)] border-[var(--accent-line)] text-[var(--accent)]' : 'bg-[var(--bg-2)] border-[var(--line-2)] text-[var(--fg-3)]'}`}>
                    {sheets && total > 0 ? (
                        <span className="flex gap-[3px]">
                            {Array.from({ length: total }, (_, i) => (
                                <span key={i} className={`w-1.5 h-1.5 rounded-full ${i < done ? 'bg-[var(--accent)]' : i === done ? 'bg-[var(--accent)] animate-pulse' : 'bg-[var(--line-3)]'}`} />
                            ))}
                        </span>
                    ) : (
                        <span className="w-3 h-3 rounded-full border-2 border-[var(--line-3)]" />
                    )}
                    Character sheets · 4 at a time
                </span>
                {/* Illustrations */}
                <span className="flex items-center gap-2 px-3 py-[7px] rounded-[var(--radius-md)] border bg-[var(--bg-2)] border-[var(--line-2)] text-[12px] font-medium text-[var(--fg-3)]">
                    <span className="w-3 h-3 rounded-full border-2 border-[var(--line-3)]" />
                    Illustrations · on request
                </span>
            </div>
            {sheets && castSize > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {progress!.cast.map(c => {
                        const isWritten = progress!.writtenNames.includes(c.name);
                        return (
                            <span
                                key={c.name}
                                className={`px-2 py-0.5 rounded-full text-[12px] border transition-all duration-[200ms] ${
                                    isWritten ? 'bg-[var(--bg-3)] border-[var(--accent-line)] text-[var(--fg-0)]' : 'border-[var(--line-2)] text-[var(--fg-2)] animate-pulse'}`}
                            >
                                {c.name}
                            </span>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
