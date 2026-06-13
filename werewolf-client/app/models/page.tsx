import React from 'react';
import type { Metadata } from 'next';
import ModelsCatalog from './ModelsCatalog';
import { InfoIcon } from '@/app/components/ui-icons';
import { API_KEY_CONSTANTS, AUDIO_MODEL_CONSTANTS } from '@/app/ai/ai-models';

export const metadata: Metadata = {
    title: 'Models — Werewolf AI',
    description: 'Every model you can seat at the table — what it costs to run and where it is available.',
};

const PRICE_BANDS: { range: string; cap: string; pill: string }[] = [
    { range: '≤ $2', cap: 'Unlimited bots / game', pill: 'text-[var(--good-fg)] border-[var(--good-line)] bg-[var(--good-soft)]' },
    { range: '≤ $5', cap: 'Up to 3 bots / game', pill: 'text-[var(--accent-text)] border-[var(--accent-line)] bg-[var(--accent-soft)]' },
    { range: '≤ $15', cap: '1 bot / game', pill: 'text-[var(--warn-fg)] border-[var(--warn-line)] bg-[var(--warn-soft)]' },
    { range: '> $15', cap: 'Not available (paid only)', pill: 'text-[var(--fg-1)] border-[var(--line-3)] bg-[var(--bg-3)]' },
];

export default function ModelsPage() {
    return (
        <div className="max-w-[1040px] mx-auto w-full text-[var(--fg-0)] pb-16">
            {/* Page header */}
            <header className="pt-10 sm:pt-14 pb-2">
                <div className="inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.16em] uppercase text-[var(--fg-2)] mb-3.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] shadow-[0_0_8px_var(--accent-line)]" />
                    Catalog
                </div>
                <h1 className="m-0 font-bold tracking-[-0.03em] leading-[1.02] text-[clamp(34px,5vw,50px)] text-[var(--fg-0)]">Models</h1>
                <p className="mt-3.5 text-[clamp(15px,1.8vw,17px)] text-[var(--fg-2)] leading-[1.55] max-w-[60ch]">
                    Every model you can seat at the table — what it costs to run, and where it&apos;s available. Free gives you a
                    price-banded subset with per-game caps; Paid unlocks the whole catalog with no limits.
                </p>
            </header>

            {/* How Free-tier caps are derived */}
            <section className="mt-7">
                <div className="border border-[var(--line-1)] rounded-[var(--radius-xl)] bg-[var(--bg-1)] p-6 sm:p-7 overflow-hidden">
                    <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_0.95fr] gap-6 lg:gap-8 items-start">
                        <div>
                            <h3 className="m-0 mb-2 text-base font-semibold tracking-[-0.01em] text-[var(--fg-0)]">How Free-tier caps are derived</h3>
                            <p className="m-0 mb-3.5 text-[13.5px] text-[var(--fg-2)] leading-[1.6]">
                                The metric is a model&apos;s <strong className="text-[var(--fg-1)] font-semibold">output price</strong> ($/1M tokens) — the
                                dominant generation cost. Free-tier caps aren&apos;t hand-set; they&apos;re computed straight from that price, so every cap
                                stays in step with the model&apos;s cost.
                            </p>
                            <p className="m-0 text-[13.5px] text-[var(--fg-2)] leading-[1.6]">
                                <strong className="text-[var(--fg-1)] font-semibold">Thinking handling:</strong> an optional{' '}
                                <span className="font-mono text-[10px] tracking-[0.02em] px-[7px] py-[2px] rounded-full bg-[var(--bg-3)] border border-[var(--line-2)] text-[var(--fg-2)]">×2.5</span>{' '}
                                variant shares its API name with a cheaper sibling but burns extra reasoning tokens, so its effective price is
                                multiplied by <strong className="text-[var(--fg-1)] font-semibold">2.5×</strong> before banding. Always-on reasoning
                                models (GPT-5.x, Gemini 3.x, Magistral) have no sibling and are priced as listed.
                            </p>
                        </div>
                        <table className="w-full border-collapse text-[13px]">
                            <thead>
                                <tr>
                                    <th className="text-left pb-2.5 font-mono text-[10.5px] tracking-[0.06em] uppercase text-[var(--fg-3)] font-medium border-b border-[var(--line-1)]">Output price (effective)</th>
                                    <th className="text-right pb-2.5 font-mono text-[10.5px] tracking-[0.06em] uppercase text-[var(--fg-3)] font-medium border-b border-[var(--line-1)]">Free-tier cap</th>
                                </tr>
                            </thead>
                            <tbody>
                                {PRICE_BANDS.map((b) => (
                                    <tr key={b.range}>
                                        <td className="py-[11px] border-b border-[var(--line-1)] last:border-b-0 font-mono text-[var(--fg-2)] align-middle">{b.range}</td>
                                        <td className="py-[11px] border-b border-[var(--line-1)] text-right align-middle">
                                            <span className={`font-mono text-[10.5px] tracking-[0.03em] uppercase px-[9px] py-[3px] rounded-full whitespace-nowrap border ${b.pill}`}>{b.cap}</span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </section>

            {/* The catalog */}
            <section className="mt-11">
                <div className="flex items-baseline justify-between gap-4 mb-[18px] flex-wrap">
                    <h2 className="m-0 font-mono text-[13px] font-semibold tracking-[0.08em] uppercase text-[var(--fg-2)]">The catalog</h2>
                </div>
                <ModelsCatalog />

                <div className="flex items-start gap-3 border border-dashed border-[var(--line-2)] rounded-[var(--radius-lg)] bg-[var(--bg-1)] p-4 mt-[22px]">
                    <InfoIcon className="w-4 h-4 text-[var(--fg-3)] flex-shrink-0 mt-0.5" />
                    <p className="m-0 text-[13px] text-[var(--fg-2)] leading-[1.55]">
                        On the <b className="text-[var(--fg-1)] font-semibold">Paid tier</b> the entire catalog above is available with{' '}
                        <b className="text-[var(--fg-1)] font-semibold">no per-game bot caps</b> — the Free-tier column shows the limit that
                        applies when you play for free.
                    </p>
                </div>
            </section>

            {/* Voice models */}
            <section className="mt-11">
                <div className="flex items-baseline justify-between gap-4 mb-[18px] flex-wrap">
                    <h2 className="m-0 font-mono text-[13px] font-semibold tracking-[0.08em] uppercase text-[var(--fg-2)]">Voice models (TTS / STT)</h2>
                </div>
                <div className="border border-[var(--line-1)] rounded-[var(--radius-xl)] bg-[var(--bg-1)] p-6 sm:p-7">
                    <p className="m-0 mb-4 text-[13.5px] text-[var(--fg-2)] leading-[1.55] max-w-[70ch]">
                        Text-to-speech and speech-to-text are available on every tier when you provide your own OpenAI key. Usage is recorded
                        in your monthly spendings.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="border border-[var(--line-1)] rounded-[var(--radius-lg)] bg-[var(--bg-0)] px-4 py-3.5">
                            <div className="font-mono text-[11px] tracking-[0.06em] uppercase text-[var(--fg-3)] mb-1.5">Text-to-speech</div>
                            <div className="text-[14px] text-[var(--fg-0)] font-mono">{AUDIO_MODEL_CONSTANTS.TTS}</div>
                            <div className="text-[12.5px] text-[var(--fg-2)] mt-1">$15 per 1M characters</div>
                        </div>
                        <div className="border border-[var(--line-1)] rounded-[var(--radius-lg)] bg-[var(--bg-0)] px-4 py-3.5">
                            <div className="font-mono text-[11px] tracking-[0.06em] uppercase text-[var(--fg-3)] mb-1.5">Speech-to-text</div>
                            <div className="text-[14px] text-[var(--fg-0)] font-mono">{AUDIO_MODEL_CONSTANTS.STT}</div>
                            <div className="text-[12.5px] text-[var(--fg-2)] mt-1">$0.006 per audio minute</div>
                        </div>
                    </div>
                    <p className="m-0 mt-3 text-[12px] text-[var(--fg-3)] font-mono">Requires: {API_KEY_CONSTANTS.OPENAI}</p>
                </div>
            </section>
        </div>
    );
}
