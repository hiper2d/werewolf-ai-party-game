'use client';

import React, { useMemo, useState } from 'react';
import {
    SupportedAiModels,
    SupportedAiKeyNames,
    MODEL_PRICING,
    FREE_TIER_THINKING_COST_FACTOR,
    FREE_TIER_LIMITED_MAX_BOTS,
    FREE_TIER_OUTPUT_PRICE_BANDS,
    getFreeTierPolicy,
} from '@/app/ai/ai-models';

type BandId = 'unlim' | 'three' | 'one' | 'paid';
type Filter = 'all' | 'free' | 'paid';

interface CatalogModel {
    id: string;               // SupportedAiModels key (LLM_CONSTANTS value)
    name: string;
    provider: string;
    inputPrice: number;       // input $/1M (cache-miss)
    cachedPrice: number | null; // cached input $/1M, when the model has a cache-hit rate
    price: number;            // listed output $/1M
    eff: number | null;       // effective output $/1M when the ×2.5 thinking multiplier applies
}

// Cache prices can be tiny (e.g. $0.0028); keep enough precision instead of rounding to $0.00.
const fmtCached = (price: number): string => parseFloat(price.toFixed(4)).toString();

interface BandMeta {
    id: BandId;
    capLabel: string;   // header pill label
    cap: string;        // per-row cap tag
    range: string;
    desc: string;
    availability: 'free' | 'paid';
    pill: string;       // tailwind classes for pill / cap-tag surface
    dot: string;        // tailwind class for the status dot bg
}

const BAND_META: Record<BandId, BandMeta> = {
    unlim: {
        id: 'unlim', capLabel: 'Unlimited bots / game', cap: 'Unlimited', range: `≤ $${FREE_TIER_OUTPUT_PRICE_BANDS.UNLIMITED_MAX}`,
        desc: 'No per-game limit on Free.', availability: 'free',
        pill: 'text-[var(--good-fg)] border-[var(--good-line)] bg-[var(--good-soft)]', dot: 'bg-[var(--good-fg)]',
    },
    three: {
        id: 'three', capLabel: 'Up to 3 bots / game', cap: '3 / game', range: `≤ $${FREE_TIER_OUTPUT_PRICE_BANDS.LIMITED_MAX}`,
        desc: 'Seat up to three on Free.', availability: 'free',
        pill: 'text-[var(--accent-text)] border-[var(--accent-line)] bg-[var(--accent-soft)]', dot: 'bg-[var(--accent)]',
    },
    one: {
        id: 'one', capLabel: '1 bot / game', cap: '1 / game', range: `≤ $${FREE_TIER_OUTPUT_PRICE_BANDS.SINGLE_MAX}`,
        desc: 'One per game on Free.', availability: 'free',
        pill: 'text-[var(--warn-fg)] border-[var(--warn-line)] bg-[var(--warn-soft)]', dot: 'bg-[var(--warn-fg)]',
    },
    paid: {
        id: 'paid', capLabel: 'Paid tier only', cap: 'Paid only', range: `> $${FREE_TIER_OUTPUT_PRICE_BANDS.SINGLE_MAX}`,
        desc: 'Not available on Free.', availability: 'paid',
        pill: 'text-[var(--fg-1)] border-[var(--line-3)] bg-[var(--bg-3)]', dot: 'bg-[var(--fg-2)]',
    },
};

const BAND_ORDER: BandId[] = ['unlim', 'three', 'one', 'paid'];

function policyToBand(maxBots: number, available: boolean): BandId {
    if (!available) return 'paid';
    if (maxBots === -1) return 'unlim';
    if (maxBots === FREE_TIER_LIMITED_MAX_BOTS) return 'three';
    return 'one';
}

function buildBands(): Record<BandId, CatalogModel[]> {
    const out: Record<BandId, CatalogModel[]> = { unlim: [], three: [], one: [], paid: [] };
    for (const [id, config] of Object.entries(SupportedAiModels)) {
        const pricing = MODEL_PRICING[config.modelApiName];
        if (!pricing) continue;
        const policy = config.freeTier ?? getFreeTierPolicy(config.modelApiName, config.hasThinking);
        const band = policyToBand(policy.maxBotsPerGame, policy.available);
        out[band].push({
            id,
            name: config.displayName,
            provider: SupportedAiKeyNames[config.apiKeyName] ?? config.apiKeyName,
            inputPrice: pricing.inputPrice,
            cachedPrice: pricing.cacheHitPrice ?? null,
            price: pricing.outputPrice,
            // "eff" = effective output price: the raw output rate scaled up to include the reasoning
            // (thinking) tokens a reasoning model emits on average. Shown for every model that
            // reasons, whether thinking is optional or always on.
            eff: config.hasThinking ? pricing.outputPrice * FREE_TIER_THINKING_COST_FACTOR : null,
        });
    }
    // Within each band, order by price, cheapest first: input price, then output price,
    // then effective output price as the final tiebreak.
    for (const id of BAND_ORDER) {
        out[id].sort((a, b) =>
            a.inputPrice - b.inputPrice || a.price - b.price || (a.eff ?? a.price) - (b.eff ?? b.price));
    }
    return out;
}

function Band({ meta, models }: { meta: BandMeta; models: CatalogModel[] }) {
    if (models.length === 0) return null;
    return (
        <section className="mt-[26px]">
            <div className="flex items-center gap-3 mb-3 flex-wrap">
                <span className={`inline-flex items-center gap-[7px] font-mono text-[11px] tracking-[0.04em] uppercase px-3 py-[5px] rounded-full whitespace-nowrap border ${meta.pill}`}>
                    <span className={`w-[7px] h-[7px] rounded-full ${meta.dot}`} />
                    {meta.capLabel}
                </span>
                <span className="text-[13px] text-[var(--fg-3)] font-mono whitespace-nowrap">{meta.range}</span>
                <span className="text-[13px] text-[var(--fg-2)]">{meta.desc}</span>
            </div>
            <div className="overflow-x-auto">
                <div className="min-w-[560px] border border-[var(--line-1)] rounded-[var(--radius-lg)] overflow-hidden bg-[var(--bg-1)]">
                    <table className="w-full border-collapse">
                        <thead>
                            <tr>
                                <th className="text-left px-5 py-3 font-mono text-[10.5px] tracking-[0.07em] uppercase text-[var(--fg-3)] font-medium border-b border-[var(--line-1)] bg-[var(--bg-2)]">Model</th>
                                <th className="text-right px-5 py-3 font-mono text-[10.5px] tracking-[0.07em] uppercase text-[var(--fg-3)] font-medium border-b border-[var(--line-1)] bg-[var(--bg-2)]">In $/1M</th>
                                <th className="text-right px-5 py-3 font-mono text-[10.5px] tracking-[0.07em] uppercase text-[var(--fg-3)] font-medium border-b border-[var(--line-1)] bg-[var(--bg-2)]">Out $/1M</th>
                                <th className="text-right px-5 py-3 font-mono text-[10.5px] tracking-[0.07em] uppercase text-[var(--fg-3)] font-medium border-b border-[var(--line-1)] bg-[var(--bg-2)]">Free-tier</th>
                            </tr>
                        </thead>
                        <tbody>
                            {models.map((m, i) => (
                                <tr key={m.name + i} className="transition-colors duration-[120ms] hover:bg-[var(--bg-2)]">
                                    <td className="px-5 py-[14px] border-b border-[var(--line-1)] last:border-b-0 align-middle">
                                        <span className="flex items-center gap-[9px] flex-wrap text-[14px] font-medium text-[var(--fg-0)]">
                                            <span>{m.name}</span>
                                            {m.eff !== null && (
                                                <span className="font-mono text-[10px] tracking-[0.02em] px-[7px] py-[2px] rounded-full bg-[var(--bg-3)] border border-[var(--line-2)] text-[var(--fg-2)] whitespace-nowrap">×2.5</span>
                                            )}
                                        </span>
                                        <span className="block text-[12px] text-[var(--fg-3)] font-mono mt-0.5">{m.provider}</span>
                                    </td>
                                    <td className="px-5 py-[14px] border-b border-[var(--line-1)] text-right font-mono text-[13.5px] text-[var(--fg-1)] whitespace-nowrap align-middle">
                                        {m.inputPrice.toFixed(2)}
                                        {m.cachedPrice !== null && <span className="block text-[11px] text-[var(--fg-3)] mt-0.5">cached {fmtCached(m.cachedPrice)}</span>}
                                    </td>
                                    <td className="px-5 py-[14px] border-b border-[var(--line-1)] text-right font-mono text-[13.5px] text-[var(--fg-1)] whitespace-nowrap align-middle">
                                        {m.price.toFixed(2)}
                                        {m.eff !== null && <span className="block text-[11px] text-[var(--fg-3)] mt-0.5">eff {m.eff.toFixed(2)}</span>}
                                    </td>
                                    <td className="px-5 py-[14px] border-b border-[var(--line-1)] text-right align-middle">
                                        <span className={`font-mono text-[10.5px] tracking-[0.03em] uppercase px-[9px] py-[3px] rounded-full whitespace-nowrap border ${meta.pill}`}>{meta.cap}</span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </section>
    );
}

export default function ModelsCatalog() {
    const bands = useMemo(buildBands, []);
    const [filter, setFilter] = useState<Filter>('all');

    const shownIds = BAND_ORDER.filter((id) =>
        filter === 'all' ? true : filter === 'free' ? BAND_META[id].availability === 'free' : BAND_META[id].availability === 'paid'
    );
    const count = shownIds.reduce((n, id) => n + bands[id].length, 0);

    const seg = (id: Filter, label: string) => (
        <button
            type="button"
            onClick={() => setFilter(id)}
            className={`font-mono text-[11px] tracking-[0.05em] uppercase px-[14px] py-[6px] rounded-full whitespace-nowrap transition-all duration-[120ms] ${
                filter === id ? 'bg-[var(--bg-3)] text-[var(--fg-0)] shadow-[var(--shadow-1)]' : 'text-[var(--fg-2)] hover:text-[var(--fg-0)]'
            }`}
        >
            {label}
        </button>
    );

    return (
        <div>
            <div className="flex items-center gap-3 mb-1.5 flex-wrap">
                <div className="inline-flex items-center p-[3px] border border-[var(--line-2)] rounded-full bg-[var(--bg-1)]">
                    {seg('all', 'All')}
                    {seg('free', 'On Free')}
                    {seg('paid', 'Paid only')}
                </div>
                <span className="text-[12.5px] text-[var(--fg-3)] font-mono whitespace-nowrap">{count} models</span>
            </div>
            {shownIds.map((id) => <Band key={id} meta={BAND_META[id]} models={bands[id]} />)}
            <p className="mt-6 text-[12.5px] leading-[1.6] text-[var(--fg-3)]">
                <span className="font-mono text-[10px] tracking-[0.02em] px-[7px] py-[2px] rounded-full bg-[var(--bg-3)] border border-[var(--line-2)] text-[var(--fg-2)] align-middle">×{FREE_TIER_THINKING_COST_FACTOR}</span>
                {' '}and the <span className="font-mono text-[var(--fg-2)]">eff</span> figure mark reasoning models. A reasoning
                model &ldquo;thinks&rdquo; before it answers, and those hidden thinking tokens are billed at the output rate
                on top of the visible reply — so a turn costs more than the listed output price. The{' '}
                <span className="font-mono text-[var(--fg-2)]">eff</span> (effective) price is the output rate scaled by
                ×{FREE_TIER_THINKING_COST_FACTOR} to include that reasoning overhead on average. It&apos;s the real extra cost
                of running a model in thinking mode.
            </p>
        </div>
    );
}
