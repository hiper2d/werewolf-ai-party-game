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
        redirect('/api/auth/signin');
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
        // User might not exist yet, use defaults
        userTier = USER_TIERS.FREE;
        voiceProvider = getDefaultVoiceProvider();
    }

    return (
        <div className="flex h-full text-white overflow-hidden">
            {/* Left column */}
            <div className="w-1/4 flex flex-col pr-4 overflow-auto h-full">
                {/* User info */}
                <div className="bg-black bg-opacity-30 border border-white border-opacity-30 rounded p-4 mb-4">
                    <h1 className="text-2xl font-bold mb-2">User Profile</h1>
                    <div className="text-sm text-gray-300 mb-2">
                        <Image src={session.user?.image ?? '/mememan.webp'} width="100" height="100" alt="User profile" className="rounded-full" />
                    </div>
                    <div className="text-sm text-gray-300 mb-2">
                        <p>Name: {session.user?.name}</p>
                        <p>Email: {session.user?.email}</p>
                        <p className="mt-2">
                            <span className="font-semibold">Tier: </span>
                            <span className={userTier === USER_TIERS.API ? 'text-green-400' : 'text-yellow-400'}>
                                {userTier.toUpperCase()}
                            </span>
                        </p>
                    </div>
                </div>

                {/* Monthly Spendings */}
                <div className="bg-black bg-opacity-30 border border-white border-opacity-30 rounded p-4 mb-4">
                    <h2 className="text-xl font-bold mb-2">Monthly Spendings</h2>
                    <ul>
                        {buildMonthlySpendings(user?.spendings ?? []).map(({ label, amount }) => (
                            <li key={label} className="mb-2 flex justify-between text-sm">
                                <span>{label}</span>
                                <span className="font-semibold">{formatCurrency(amount)}</span>
                            </li>
                        ))}
                    </ul>
                </div>

                {/* Voice Provider Selection */}
                <div className="bg-black bg-opacity-30 border border-white border-opacity-30 rounded p-4 flex-1 overflow-auto">
                    <VoiceProviderSelector
                        userId={session.user?.email!}
                        initialProvider={voiceProvider}
                    />
                </div>
            </div>

            {/* Right column - Tier-based content */}
            <div className="w-3/4 h-full overflow-hidden">
                <div className="h-full flex flex-col bg-black bg-opacity-30 border border-white border-opacity-30 rounded">
                    {userTier === USER_TIERS.API ? (
                        <ApiKeyManagement initialApiKeys={apiKeys} userId={session.user?.email!} />
                    ) : (
                        <FreeUserLimits userId={session.user?.email!} />
                    )}
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
