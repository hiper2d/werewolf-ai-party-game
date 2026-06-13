import React from 'react';
import { redirect } from 'next/navigation';
import Image from 'next/image';
import { getUser } from '@/app/api/user-actions';
import { getGamesCreatedTodayCount } from '@/app/api/game-actions';
import { UserTier, USER_TIERS, FREE_TIER_LIMITS } from '@/app/api/game-models';
import { getFreeTierModels } from '@/app/ai/ai-models';
import { auth } from '@/auth';
import { GoogleIcon, GithubIcon } from '@/app/components/ui-icons';
import ProfileTierCards from './components/ProfileTierCards';
import BalanceTopUp from './components/BalanceTopUp';

interface PageProps {
    searchParams: Promise<{ payment?: string }>;
}

function formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(amount || 0);
}

function initialsFrom(name?: string | null): string {
    if (!name) return 'WW';
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return 'WW';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function detectProvider(imageUrl?: string | null): 'google' | 'github' | null {
    if (!imageUrl) return null;
    if (imageUrl.includes('googleusercontent')) return 'google';
    if (imageUrl.includes('githubusercontent') || imageUrl.includes('github')) return 'github';
    return null;
}

export default async function UserProfilePage({ searchParams }: PageProps) {
    const session = await auth();
    if (!session) {
        redirect('/?login=true&callbackUrl=%2Fprofile');
    }

    const params = await searchParams;
    const email = session.user?.email!;

    let userTier: UserTier = USER_TIERS.FREE;
    let balance = 0;
    let spendings: { period: string; amountUSD: number; freeAmountUSD?: number; paidAmountUSD?: number }[] = [];

    try {
        const user = await getUser(email);
        userTier = user?.tier || USER_TIERS.FREE;
        balance = user?.balance || 0;
        spendings = user?.spendings ?? [];
    } catch (error) {
        console.error('Error fetching user data:', error);
    }

    const isPaid = userTier === USER_TIERS.PAID;

    // Current-month spend (logged on free, billed on paid).
    const now = new Date();
    const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const thisMonth = spendings.find((s) => s.period === period);
    const monthAmount = thisMonth?.amountUSD ?? 0;

    const freeModelCount = getFreeTierModels().length;
    const gamesPerDay = FREE_TIER_LIMITS.GAMES_PER_CALENDAR_DAY;

    let gamesToday = 0;
    if (!isPaid) {
        try {
            gamesToday = await getGamesCreatedTodayCount();
        } catch {
            gamesToday = 0;
        }
    }
    const gamesLeft = Math.max(0, gamesPerDay - gamesToday);
    const gamesPct = Math.min(100, (gamesToday / gamesPerDay) * 100);
    const meterWarn = gamesLeft <= 1;

    const provider = detectProvider(session.user?.image);
    const initials = initialsFrom(session.user?.name);

    const tierPillClass = isPaid
        ? 'text-[var(--accent-text)] border-[var(--accent-line)] bg-[var(--accent-soft)]'
        : 'text-[var(--fg-1)] border-[var(--line-2)] bg-[var(--bg-0)]';
    const tierDotClass = isPaid ? 'bg-[var(--accent)] shadow-[0_0_7px_var(--accent-line)]' : 'bg-[var(--fg-2)]';
    const tierLabel = isPaid ? 'Paid tier' : userTier === USER_TIERS.API ? 'API tier' : 'Free tier';

    const statCard = 'flex flex-col gap-2.5 border border-[var(--line-1)] rounded-[var(--radius-lg)] bg-[var(--bg-1)] px-[22px] pt-5 pb-[22px]';
    const statLabel = 'flex items-center justify-between gap-2 font-mono text-[12px] tracking-[0.06em] uppercase text-[var(--fg-2)]';
    const statValue = 'flex items-baseline gap-1.5 text-[30px] font-bold tracking-[-0.02em] leading-none text-[var(--fg-0)]';
    const statUnit = 'text-[14px] font-medium text-[var(--fg-2)] tracking-normal';
    const statSub = 'text-[12.5px] text-[var(--fg-3)] leading-[1.45] [&_b]:text-[var(--fg-1)] [&_b]:font-semibold';
    const miniBadge = 'font-mono text-[10px] tracking-[0.04em] uppercase px-[7px] py-0.5 rounded-full border';
    const miniBadgeNeutral = `${miniBadge} text-[var(--fg-2)] border-[var(--line-2)] bg-[var(--bg-0)]`;
    const miniBadgeGood = `${miniBadge} text-[var(--good-fg)] border-[var(--good-line)] bg-[var(--good-soft)]`;

    return (
        <div className="max-w-[1040px] mx-auto w-full text-[var(--fg-0)] pb-16">
            {params.payment === 'success' && (
                <div className="mt-4 p-3 rounded-[var(--radius-lg)] border border-[var(--good-line)] bg-[var(--good-soft)] text-[var(--good-fg)] text-[13px]">
                    Payment successful! Your balance has been updated.
                </div>
            )}

            {/* Page header */}
            <header className="pt-10 sm:pt-14 pb-2">
                <div className="inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.16em] uppercase text-[var(--fg-2)] mb-3.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] shadow-[0_0_8px_var(--accent-line)]" />
                    Account
                </div>
                <h1 className="m-0 font-bold tracking-[-0.03em] leading-[1.02] text-[clamp(34px,5vw,50px)] text-[var(--fg-0)]">Profile</h1>
                <p className="mt-3.5 text-[clamp(15px,1.8vw,17px)] text-[var(--fg-2)] leading-[1.55] max-w-[60ch]">
                    Your account, your current tier, and what it unlocks at the table.
                </p>
            </header>

            {/* Account header card */}
            <section className="mt-7">
                <div className="flex items-center gap-[22px] flex-wrap border border-[var(--line-1)] rounded-[var(--radius-xl)] bg-[var(--bg-1)] px-7 py-[26px]">
                    {session.user?.image ? (
                        <Image
                            src={session.user.image}
                            width={64}
                            height={64}
                            alt="Profile"
                            className="w-16 h-16 rounded-full border border-[var(--line-2)] shadow-[var(--shadow-1)] flex-shrink-0 object-cover"
                        />
                    ) : (
                        <div className="w-16 h-16 rounded-full flex-shrink-0 grid place-items-center border border-[var(--line-2)] shadow-[var(--shadow-1)] bg-[linear-gradient(150deg,var(--bg-4),var(--bg-2))] font-mono text-[22px] font-semibold text-[var(--fg-1)]">
                            {initials}
                        </div>
                    )}
                    <div className="flex flex-col gap-1 min-w-0">
                        <span className="text-[21px] font-semibold tracking-[-0.01em] text-[var(--fg-0)]">{session.user?.name}</span>
                        <span className="text-[13.5px] text-[var(--fg-2)] font-mono break-all">{email}</span>
                        {provider && (
                            <div className="flex items-center gap-2.5 mt-1.5 flex-wrap">
                                <span className="inline-flex items-center gap-1.5 text-[11.5px] text-[var(--fg-2)] pl-[7px] pr-[9px] py-[3px] rounded-full border border-[var(--line-2)] bg-[var(--bg-0)]">
                                    {provider === 'google' ? <GoogleIcon className="w-[13px] h-[13px]" /> : <GithubIcon className="w-[13px] h-[13px]" />}
                                    <span>Signed in with {provider === 'google' ? 'Google' : 'GitHub'}</span>
                                </span>
                            </div>
                        )}
                    </div>
                    <div className="flex-1 basis-6" />
                    <div className="flex flex-col items-end gap-3">
                        <span className={`inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.08em] uppercase px-[13px] py-1.5 rounded-full whitespace-nowrap border ${tierPillClass}`}>
                            <span className={`w-[7px] h-[7px] rounded-full ${tierDotClass}`} />
                            {tierLabel}
                        </span>
                    </div>
                </div>
            </section>

            {/* Live status tiles */}
            <section className="mt-11">
                <div className="flex items-baseline justify-between gap-4 mb-[18px] flex-wrap">
                    <h2 className="m-0 font-mono text-[13px] font-semibold tracking-[0.08em] uppercase text-[var(--fg-2)]">
                        {isPaid ? 'Balance & usage' : 'Your free allowance'}
                    </h2>
                </div>

                {isPaid ? (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                        <div className={statCard}>
                            <div className={statLabel}><span>Balance</span><span className={miniBadgeGood}>Active</span></div>
                            <div className={statValue}>{formatCurrency(balance)}</div>
                            <div className={statSub}>Every action is billed at <b>cost + 15%</b> and deducted here. Games start while the balance stays above zero.</div>
                            <div className="mt-0.5">
                                <a href="#add-balance" className="inline-flex items-center justify-center w-full font-semibold text-[13px] px-4 py-2.5 rounded-[var(--radius-md)] bg-[var(--accent)] text-[var(--accent-fg)] border border-transparent shadow-[var(--shadow-1)] hover:bg-[var(--accent-strong)] transition-all duration-[120ms]">
                                    Top up balance
                                </a>
                            </div>
                        </div>
                        <div className={statCard}>
                            <div className={statLabel}><span>Spent this month</span></div>
                            <div className={statValue}>{formatCurrency(monthAmount)}</div>
                            <div className={statSub}>Across tokens and voice seconds, billed to your balance. Resets on the 1st.</div>
                        </div>
                        <div className={statCard}>
                            <div className={statLabel}><span>Models</span></div>
                            <div className={statValue}>Full<span className={statUnit}>catalog</span></div>
                            <div className={statSub}>Every model unlocked with <b>no per-game caps</b>. Voices billed to balance.</div>
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                        <div className={statCard}>
                            <div className={statLabel}><span>Games today</span><span className={miniBadgeNeutral}>{gamesLeft} left</span></div>
                            <div className={statValue}>{gamesToday}<span className={statUnit}>/ {gamesPerDay} per day</span></div>
                            <div className="h-[7px] rounded-full bg-[var(--bg-3)] overflow-hidden border border-[var(--line-1)]">
                                <div className={`h-full rounded-full ${meterWarn ? 'bg-[var(--warn-fg)]' : 'bg-[var(--accent)]'}`} style={{ width: `${gamesPct}%` }} />
                            </div>
                            <div className={statSub}>Free starts up to <b>{gamesPerDay} games per calendar day</b>. Resets at midnight.</div>
                        </div>
                        <div className={statCard}>
                            <div className={statLabel}><span>This month</span><span className={miniBadgeGood}>No charge</span></div>
                            <div className={statValue}>{formatCurrency(monthAmount)}</div>
                            <div className={statSub}>Usage is <b>logged but not billed</b> — the platform covers Free-tier play.</div>
                        </div>
                        <div className={statCard}>
                            <div className={statLabel}><span>Models available</span></div>
                            <div className={statValue}>{freeModelCount}<span className={statUnit}>on Free</span></div>
                            <div className={statSub}>A price-banded subset, each with a per-game bot cap.</div>
                        </div>
                    </div>
                )}
            </section>

            {/* Add balance (paid) — preserves the Stripe top-up flow */}
            {isPaid && (
                <section id="add-balance" className="mt-11 scroll-mt-20">
                    <div className="flex items-baseline justify-between gap-4 mb-[18px] flex-wrap">
                        <h2 className="m-0 font-mono text-[13px] font-semibold tracking-[0.08em] uppercase text-[var(--fg-2)]">Add balance</h2>
                    </div>
                    <div className="border border-[var(--line-1)] rounded-[var(--radius-xl)] bg-[var(--bg-1)] p-6 sm:p-7">
                        <p className="m-0 mb-4 text-[13.5px] text-[var(--fg-2)] leading-[1.55]">
                            Top up your prepaid balance. Each AI call is billed at the model&apos;s base price + 15% (covers hosting and beer for devs).
                        </p>
                        <BalanceTopUp userId={email} />
                    </div>
                </section>
            )}

            {/* Free vs Paid explainer */}
            <section id="tier" className="mt-11 scroll-mt-20">
                <div className="flex items-baseline justify-between gap-4 mb-[18px] flex-wrap">
                    <h2 className="m-0 font-mono text-[13px] font-semibold tracking-[0.08em] uppercase text-[var(--fg-2)]">Free vs Paid</h2>
                    <span className="text-[13px] text-[var(--fg-3)]">Same platform keys — the difference is the limits and who pays.</span>
                </div>
                <ProfileTierCards currentTier={userTier} userId={email} />
            </section>
        </div>
    );
}
