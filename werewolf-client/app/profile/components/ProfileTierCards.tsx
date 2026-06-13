'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { UserTier } from '@/app/api/game-models';
import { updateUserTier } from '@/app/api/user-actions';
import { CheckIcon, DashIcon, ArrowIcon } from '@/app/components/ui-icons';

type TierId = 'free' | 'paid';

interface Feat {
    ok: boolean;
    node: React.ReactNode;
}

const TIER_INFO: Record<TierId, { name: string; cost: [string, string]; blurb: string; feats: Feat[] }> = {
    free: {
        name: 'Free',
        cost: ['$0', 'platform pays'],
        blurb: "Zero-cost play on the platform's shared keys — capped so it stays free.",
        feats: [
            { ok: true, node: <span><b>Shared platform keys</b> — nothing to bring or configure.</span> },
            { ok: false, node: <span>Max <b>5 games per calendar day</b>.</span> },
            { ok: true, node: <span>A <b>price-banded model subset</b>, each with a per-game bot cap.</span> },
            { ok: false, node: <span>Per-model limits: <b>unlimited, 3, or 1 bot</b> per game by price.</span> },
            { ok: true, node: <span>Voices (TTS / STT) work free via the platform key.</span> },
            { ok: true, node: <span>Usage logged to monthly spendings — <b>never charged</b>.</span> },
        ],
    },
    paid: {
        name: 'Paid',
        cost: ['Pay as you go', 'cost + 15%'],
        blurb: 'Unlock the whole catalog with no per-game limits. Pre-load a balance; pay only for what you use.',
        feats: [
            { ok: true, node: <span><b>Full model catalog</b> — every model, no per-game bot caps.</span> },
            { ok: true, node: <span><b>No daily game limit</b> — play as long as the balance is positive.</span> },
            { ok: true, node: <span>Actual cost <b>+ 15% markup</b> deducted from balance per action.</span> },
            { ok: true, node: <span>Prepaid <b>balance</b> you top up anytime.</span> },
            { ok: true, node: <span>Voices (TTS / STT) work, billed to balance.</span> },
            { ok: false, node: <span>Games are gated on <b>balance &gt; 0</b> (else &ldquo;Insufficient balance&rdquo;).</span> },
        ],
    },
};

function scrollToAddBalance() {
    document.getElementById('add-balance')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function TierCard({ id, currentTier, userId }: { id: TierId; currentTier: UserTier; userId: string }) {
    const info = TIER_INFO[id];
    const isCurrent = currentTier === id;
    const [switching, setSwitching] = useState(false);

    const handleSwitch = async (target: TierId) => {
        if (switching) return;
        setSwitching(true);
        try {
            await updateUserTier(userId, target);
            window.location.reload();
        } catch (error) {
            console.error('Failed to switch tier:', error);
            alert('Failed to switch tier. Please try again.');
            setSwitching(false);
        }
    };

    return (
        <article
            className={`relative flex flex-col gap-[18px] border rounded-[var(--radius-xl)] p-7 pb-[30px] ${
                isCurrent
                    ? 'border-[var(--accent-line)] shadow-[var(--shadow-2)] bg-[linear-gradient(168deg,color-mix(in_oklch,var(--accent-soft)_55%,var(--bg-1))_0%,var(--bg-1)_44%)]'
                    : 'border-[var(--line-1)] bg-[var(--bg-1)]'
            }`}
        >
            {isCurrent && (
                <span className="absolute -top-[11px] left-6 font-mono text-[10px] tracking-[0.08em] uppercase px-[11px] py-1 rounded-full bg-[var(--accent)] text-[var(--accent-fg)] shadow-[var(--shadow-1)] whitespace-nowrap">
                    Your plan
                </span>
            )}
            <div>
                <div className="font-mono text-[13px] font-semibold tracking-[0.04em] uppercase text-[var(--fg-1)]">{info.name}</div>
                <div className="flex items-baseline gap-1.5 flex-wrap mt-2">
                    <span className="text-[30px] font-bold tracking-[-0.02em] leading-none text-[var(--fg-0)]">{info.cost[0]}</span>
                    <span className="text-[13px] text-[var(--fg-2)]">· {info.cost[1]}</span>
                </div>
            </div>
            <p className="m-0 text-[13.5px] text-[var(--fg-2)] leading-[1.55]">{info.blurb}</p>
            <ul className="list-none m-0 p-0 flex flex-col gap-3">
                {info.feats.map((f, i) => (
                    <li key={i} className="flex items-start gap-[11px] text-[13.5px] text-[var(--fg-1)] leading-[1.5] [&_b]:text-[var(--fg-0)] [&_b]:font-semibold">
                        <span
                            className={`flex-shrink-0 w-[19px] h-[19px] mt-px rounded-full grid place-items-center border ${
                                f.ok
                                    ? 'bg-[var(--accent-soft)] border-[var(--accent-line)] text-[var(--accent-text)]'
                                    : 'bg-[var(--warn-soft)] border-[var(--warn-line)] text-[var(--warn-fg)]'
                            }`}
                        >
                            {f.ok ? <CheckIcon className="w-[11px] h-[11px]" /> : <DashIcon className="w-[11px] h-[11px]" />}
                        </span>
                        {f.node}
                    </li>
                ))}
            </ul>
            <div className="h-px bg-[var(--line-1)] my-0.5 mt-auto" />
            <div className="mt-0.5">
                {isCurrent ? (
                    id === 'free' ? (
                        <button
                            onClick={() => handleSwitch('paid')}
                            disabled={switching}
                            className="inline-flex items-center justify-center gap-2 w-full font-semibold text-[15px] px-6 py-[13px] rounded-[var(--radius-md)] bg-[var(--accent)] text-[var(--accent-fg)] border border-transparent shadow-[var(--shadow-1)] hover:bg-[var(--accent-strong)] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-[120ms]"
                        >
                            {switching ? 'Switching…' : 'Upgrade to Paid'}
                        </button>
                    ) : (
                        <button
                            onClick={scrollToAddBalance}
                            className="inline-flex items-center justify-center gap-2 w-full font-semibold text-[15px] px-6 py-[13px] rounded-[var(--radius-md)] bg-transparent text-[var(--fg-1)] border border-[var(--line-2)] hover:bg-[var(--bg-1)] hover:border-[var(--line-3)] hover:text-[var(--fg-0)] transition-all duration-[120ms]"
                        >
                            Manage balance
                        </button>
                    )
                ) : id === 'free' ? (
                    <button
                        onClick={() => handleSwitch('free')}
                        disabled={switching}
                        className="inline-flex items-center justify-center gap-2 w-full font-semibold text-[15px] px-6 py-[13px] rounded-[var(--radius-md)] bg-transparent text-[var(--fg-1)] border border-[var(--line-2)] hover:bg-[var(--bg-1)] hover:border-[var(--line-3)] hover:text-[var(--fg-0)] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-[120ms]"
                    >
                        {switching ? 'Switching…' : 'Switch to Free'}
                    </button>
                ) : (
                    <Link href="/models" className="inline-flex items-center gap-1.5 text-[13px] text-[var(--accent-text)] group">
                        Browse what {info.name} unlocks
                        <ArrowIcon className="w-3.5 h-3.5 transition-transform duration-[140ms] group-hover:translate-x-[3px]" />
                    </Link>
                )}
            </div>
        </article>
    );
}

export default function ProfileTierCards({ currentTier, userId }: { currentTier: UserTier; userId: string }) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-[18px] items-stretch">
            <TierCard id="free" currentTier={currentTier} userId={userId} />
            <TierCard id="paid" currentTier={currentTier} userId={userId} />
        </div>
    );
}
