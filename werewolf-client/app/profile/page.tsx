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
        ? 'text-green-600 dark:text-green-400'
        : userTier === USER_TIERS.PAID
            ? 'text-blue-400/70 dark:text-blue-300/60'
            : 'text-yellow-600 dark:text-yellow-400';

    return (
        <div className="flex flex-col lg:flex-row theme-text-primary">
            {/* Left column - User info & spendings */}
            <div className="lg:w-1/4 lg:sticky lg:top-20 lg:h-[calc(100vh-5rem)] lg:overflow-auto hide-scrollbar lg:pr-4 mb-6 lg:mb-0">
                {/* User info */}
                <div className="mb-4">
                    <h1 className="text-2xl font-bold mb-2">User Profile</h1>
                    <div className="flex items-center gap-4 mb-3">
                        <Image src={session.user?.image ?? '/mememan.webp'} width="64" height="64" alt="User profile" className="rounded-full" />
                        <div className="text-sm theme-text-secondary">
                            <p>{session.user?.name}</p>
                            <p>{session.user?.email}</p>
                            <p className="mt-1">
                                <span className="font-semibold">Tier: </span>
                                <span className={tierColorClass}>
                                    {userTier.toUpperCase()}
                                </span>
                            </p>
                        </div>
                    </div>
                </div>

                {/* Monthly Spendings */}
                <div className="border-t theme-border-subtle pt-3">
                    <SpendingsDisplay spendings={user?.spendings ?? []} />
                </div>
            </div>

            {/* Right column - Main content */}
            <div className="flex-1 min-w-0 lg:pl-4">
                {/* Payment success banner */}
                {params.payment === 'success' && (
                    <div className="mb-4 p-3 rounded-lg bg-green-500/10 border border-green-500/30 text-green-700 dark:text-green-400 text-sm">
                        Payment successful! Your balance has been updated.
                    </div>
                )}

                {/* Tier switcher with tab panels */}
                <div className="mb-8">
                    <TierSwitcher
                        currentTier={userTier}
                        userId={session.user?.email!}
                        apiKeys={apiKeys}
                        balance={balance}
                        initialTab={params.tab}
                    />
                </div>

                {/* Common sections */}
                <div className="space-y-6 border-t theme-border-subtle pt-6">
                    <ModelPricingTable />

                    <div className="border-t theme-border-subtle pt-6">
                        <VoiceInfoSection />
                    </div>

                </div>
            </div>
        </div>
    );
}
