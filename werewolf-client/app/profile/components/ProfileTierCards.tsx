'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { UserTier, FreeTierLimits } from '@/app/api/game-models';
import { updateUserTier } from '@/app/api/user-actions';
import { formatLimitUSD } from '@/app/api/errors';
import { CheckIcon, DashIcon, ArrowIcon } from '@/app/components/ui-icons';

type TierId = 'free' | 'paid';

interface Feat {
    ok: boolean;
    node: React.ReactNode;
}

function tierInfo(limits: FreeTierLimits): Record<TierId, { name: string; cost: [string, string]; blurb: string; feats: Feat[] }> {
    const daily = formatLimitUSD(limits.dailySpendUSD);
    const monthly = formatLimitUSD(limits.monthlySpendUSD);
    return {
        free: {
            name: 'Free',
            cost: ['$0', 'platform pays'],
            blurb: "Zero-cost play on the platform's shared keys — capped so it stays free.",
            feats: [
                { ok: true, node: <span><b>{daily} of AI a day</b> on us, up to <b>{monthly} a month</b> — resets at midnight UTC.</span> },
                { ok: false, node: <span>Up to <b>{limits.gamesPerDay} games a day</b>.</span> },
                { ok: true, node: <span>A <Link href="/models" className="text-[var(--accent-text)] hover:underline">curated set of models</Link> with per-game bot caps.</span> },
                { ok: false, node: <span>One <b>portrait reroll</b> per game.</span> },
                { ok: true, node: <span>Voices and mid-game illustrations included.</span> },
                { ok: true, node: <span><b>Never charged</b>, no card.</span> },
            ],
        },
        paid: {
            name: 'Paid',
            cost: ['Pay as you go', 'cost + 15%'],
            blurb: 'Unlock the whole catalog with no per-game limits. Pre-load a balance; pay only for what you use.',
            feats: [
                { ok: true, node: <span><b>Every model</b>, including Claude Fable 5.1 and GPT-6 Astra.</span> },
                { ok: true, node: <span><b>No daily or monthly cap</b>, no game limit, no bot caps — play while the balance is positive.</span> },
                { ok: true, node: <span><b>Unlimited portrait rerolls.</b></span> },
                { ok: true, node: <span><b>Replay a night.</b></span> },
                { ok: true, node: <span>Prepaid <b>balance</b> you top up anytime — model base price <b>+ 15%</b>.</span> },
                { ok: false, node: <span>Games are gated on <b>balance &gt; 0</b> (else &ldquo;Insufficient balance&rdquo;).</span> },
            ],
        },
    };
}

function scrollToAddBalance() {
    document.getElementById('add-balance')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function TierCard({ id, currentTier, userId, limits }: { id: TierId; currentTier: UserTier; userId: string; limits: FreeTierLimits }) {
    const info = tierInfo(limits)[id];
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

export default function ProfileTierCards({ currentTier, userId, limits }: { currentTier: UserTier; userId: string; limits: FreeTierLimits }) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-[18px] items-stretch">
            <TierCard id="free" currentTier={currentTier} userId={userId} limits={limits} />
            <TierCard id="paid" currentTier={currentTier} userId={userId} limits={limits} />
        </div>
    );
}
