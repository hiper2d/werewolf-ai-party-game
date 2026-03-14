'use client';

import React, { useState } from 'react';
import { ApiKeyMap, UserTier } from '@/app/api/game-models';
import FreeTierPanel from './FreeTierPanel';
import ApiTierPanel from './ApiTierPanel';
import PaidTierPanel from './PaidTierPanel';

interface TierSwitcherProps {
    currentTier: UserTier;
    userId: string;
    apiKeys: ApiKeyMap;
    balance: number;
    initialTab?: string;
}

const TIER_TABS: { id: UserTier; label: string; tooltip: string; color: string; activeColor: string }[] = [
    {
        id: 'free',
        label: 'FREE',
        tooltip: 'Play with shared AI keys. Limited model selection and bot count per game.',
        color: 'text-yellow-600 dark:text-yellow-400',
        activeColor: 'border-yellow-500 bg-yellow-500/10',
    },
    {
        id: 'api',
        label: 'API',
        tooltip: 'Bring your own API keys. All models unlocked, no bot limits.',
        color: 'text-green-600 dark:text-green-400',
        activeColor: 'border-green-500 bg-green-500/10',
    },
    {
        id: 'paid',
        label: 'PAID',
        tooltip: 'Buy balance and play with all models. No API keys needed.',
        color: 'text-blue-600 dark:text-blue-400',
        activeColor: 'border-blue-500 bg-blue-500/10',
    },
];

export default function TierSwitcher({
    currentTier,
    userId,
    apiKeys,
    balance,
    initialTab,
}: TierSwitcherProps) {
    const [activeTab, setActiveTab] = useState<UserTier>(
        (initialTab as UserTier) || currentTier
    );

    return (
        <div>
            {/* Tab buttons */}
            <div className="flex border-b theme-border mb-6">
                {TIER_TABS.map((tab) => {
                    const isActive = activeTab === tab.id;
                    const isCurrent = currentTier === tab.id;

                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            title={tab.tooltip}
                            className={`relative px-6 py-3 text-sm font-semibold transition-colors border-b-2 ${
                                isActive
                                    ? `${tab.activeColor} ${tab.color}`
                                    : 'border-transparent theme-text-secondary hover:theme-text-primary'
                            }`}
                        >
                            {tab.label}
                            {isCurrent && (
                                <span className="ml-2 text-xs font-normal px-1.5 py-0.5 rounded bg-gray-200 dark:bg-neutral-700 theme-text-secondary">
                                    Current
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* Tab content */}
            {activeTab === 'free' && (
                <FreeTierPanel
                    userId={userId}
                    currentTier={currentTier}
                />
            )}
            {activeTab === 'api' && (
                <ApiTierPanel
                    userId={userId}
                    currentTier={currentTier}
                    apiKeys={apiKeys}
                />
            )}
            {activeTab === 'paid' && (
                <PaidTierPanel
                    userId={userId}
                    currentTier={currentTier}
                    balance={balance}
                />
            )}
        </div>
    );
}
