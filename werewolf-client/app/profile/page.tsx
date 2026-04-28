import React from 'react';
import { redirect } from 'next/navigation';
import Image from 'next/image';
import TierSwitcher from './components/TierSwitcher';
import ModelPricingTable from './components/ModelPricingTable';
import VoiceInfoSection from './components/VoiceInfoSection';
import SpendingsDisplay from './components/SpendingsDisplay';
import { getUserApiKeys, getUser } from '@/app/api/user-actions';
import { UserTier, USER_TIERS } from '@/app/api/game-models';
import { auth } from '@/auth';

interface PageProps {
    searchParams: Promise<{ tab?: string; payment?: string }>;
}

export default async function UserProfilePage({ searchParams }: PageProps) {
    const session = await auth();
    if (!session) {
        redirect('/?login=true&callbackUrl=%2Fprofile');
    }

    const params = await searchParams;

    let user = null;
    let apiKeys = {};
    let userTier: UserTier = USER_TIERS.FREE;
    let balance = 0;

    try {
        user = await getUser(session.user?.email!);
        apiKeys = await getUserApiKeys(session.user?.email!);
        userTier = user?.tier || USER_TIERS.FREE;
        balance = user?.balance || 0;
    } catch (error) {
        console.error('Error fetching user data:', error);
        userTier = USER_TIERS.FREE;
    }

    const tierColorClass = userTier === USER_TIERS.API
        ? 'text-[var(--gm-fg)]'
        : userTier === USER_TIERS.PAID
            ? 'text-[var(--accent)]'
            : 'text-[var(--fg-2)]';

    return (
        <div className="flex flex-col lg:flex-row text-[var(--fg-0)] max-w-[1100px] mx-auto w-full">
            {/* Left column - User info & spendings */}
            <div className="lg:w-1/4 lg:sticky lg:top-20 lg:h-[calc(100dvh-5rem)] lg:overflow-auto hide-scrollbar lg:pr-4 mb-6 lg:mb-0 pt-4">
                <div className="mb-4">
                    <h1 className="text-[20px] font-semibold tracking-[-0.01em] mb-3">User Profile</h1>
                    <div className="flex items-center gap-4 mb-3">
                        <Image src={session.user?.image ?? '/mememan.webp'} width="56" height="56" alt="User profile" className="rounded-full border border-[var(--line-2)]" />
                        <div className="text-[13px] text-[var(--fg-1)]">
                            <p className="font-medium text-[var(--fg-0)]">{session.user?.name}</p>
                            <p className="text-[12px]">{session.user?.email}</p>
                            <p className="mt-1">
                                <span className={`text-[10px] font-mono uppercase tracking-[0.06em] px-1.5 py-0.5 rounded border border-[var(--line-2)] ${tierColorClass}`}>
                                    {userTier.toUpperCase()}
                                </span>
                            </p>
                        </div>
                    </div>
                </div>

                <div className="border-t border-[var(--line-1)] pt-3">
                    <SpendingsDisplay spendings={user?.spendings ?? []} />
                </div>
            </div>

            {/* Right column - Main content */}
            <div className="flex-1 min-w-0 lg:pl-4 pt-4">
                {params.payment === 'success' && (
                    <div className="mb-4 p-3 rounded-[var(--radius-lg)] bg-[oklch(60%_0.14_145_/_0.08)] border border-[oklch(60%_0.14_145_/_0.3)] text-[var(--gm-fg)] text-[13px]">
                        Payment successful! Your balance has been updated.
                    </div>
                )}

                <div className="mb-8">
                    <TierSwitcher
                        currentTier={userTier}
                        userId={session.user?.email!}
                        apiKeys={apiKeys}
                        balance={balance}
                        initialTab={params.tab}
                    />
                </div>

                <div className="space-y-6 border-t border-[var(--line-1)] pt-6">
                    <ModelPricingTable />
                    <div className="border-t border-[var(--line-1)] pt-6">
                        <VoiceInfoSection />
                    </div>
                </div>
            </div>
        </div>
    );
}
