import React from 'react';
import {redirect} from "next/navigation";
import Image from 'next/image';
import ApiKeyManagement from './components/ApiKeyManagement';
import FreeUserLimits from './components/FreeUserLimits';
import VoiceProviderSelector from './components/VoiceProviderSelector';
import {getUserApiKeys, getUser} from "@/app/api/user-actions";
import {UserTier, USER_TIERS} from "@/app/api/game-models";
import {VoiceProvider, getDefaultVoiceProvider} from "@/app/ai/voice-config";
import { auth } from "@/auth";

export default async function UserProfilePage() {
    const session = await auth();
    if (!session) {
        redirect('/?login=true&callbackUrl=%2Fprofile');
    }

    let user = null;
    let apiKeys = {};
    let userTier: UserTier = USER_TIERS.FREE;
    let voiceProvider: VoiceProvider = getDefaultVoiceProvider();

    try {
        user = await getUser(session.user?.email!);
        apiKeys = await getUserApiKeys(session.user?.email!);
        userTier = user?.tier || USER_TIERS.FREE;
        voiceProvider = user?.voiceProvider || getDefaultVoiceProvider();
    } catch (error) {
        console.error('Error fetching user data:', error);
        userTier = USER_TIERS.FREE;
        voiceProvider = getDefaultVoiceProvider();
    }

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
                                <span className={userTier === USER_TIERS.API ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400'}>
                                    {userTier.toUpperCase()}
                                </span>
                            </p>
                        </div>
                    </div>
                </div>

                {/* Monthly Spendings */}
                <div className="border-t theme-border-subtle pt-3">
                    <h2 className="text-lg font-bold mb-2">Monthly Spendings</h2>
                    <ul>
                        {buildMonthlySpendings(user?.spendings ?? []).map(({ label, amount }) => (
                            <li key={label} className="mb-2 flex justify-between text-sm theme-text-secondary">
                                <span>{label}</span>
                                <span className="font-semibold">{formatCurrency(amount)}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>

            {/* Right column - Main content */}
            <div className="flex-1 min-w-0 lg:pl-4">
                <div className="flex flex-col">
                    {userTier === USER_TIERS.API ? (
                        <ApiKeyManagement initialApiKeys={apiKeys} userId={session.user?.email!} />
                    ) : (
                        <FreeUserLimits userId={session.user?.email!} />
                    )}

                    {/* Voice Provider - in main panel */}
                    <div className="mt-6 border-t theme-border-subtle pt-6">
                        <VoiceProviderSelector
                            userId={session.user?.email!}
                            initialProvider={voiceProvider}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}

function buildMonthlySpendings(
    spendings: Array<{ period: string; amountUSD: number }> = []
) {
    const now = new Date();
    const dateFormatter = new Intl.DateTimeFormat('en-US', {
        month: 'long',
        year: 'numeric'
    });

    return Array.from({ length: 5 }, (_, index) => {
        const referenceDate = new Date(Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth() - index,
            1
        ));

        const periodKey = `${referenceDate.getUTCFullYear()}-${String(referenceDate.getUTCMonth() + 1).padStart(2, '0')}`;
        const match = spendings.find(entry => entry.period === periodKey);

        return {
            label: dateFormatter.format(referenceDate),
            amount: match?.amountUSD ?? 0
        };
    });
}

function formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(amount || 0);
}
