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
        color: 'text-[var(--fg-2)]',
        activeColor: 'border-[var(--accent-line)] bg-[var(--accent-soft)]',
    },
    {
        id: 'api',
        label: 'API',
        tooltip: 'Bring your own API keys. All models unlocked, no bot limits.',
        color: 'text-[var(--gm-fg)]',
        activeColor: 'border-[var(--accent-line)] bg-[var(--accent-soft)]',
    },
    {
        id: 'paid',
        label: 'PAID',
        tooltip: 'Buy balance and play with all models. No API keys needed.',
        color: 'text-[var(--accent)]',
        activeColor: 'border-[var(--accent-line)] bg-[var(--accent-soft)]',
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
            <div className="flex border-b border-[var(--line-1)] mb-6">
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
                                    : 'border-transparent text-[var(--fg-1)] hover:text-[var(--fg-0)]'
                            }`}
                        >
                            {tab.label}
                            {isCurrent && (
                                <span className="ml-2 text-xs font-normal px-1.5 py-0.5 rounded bg-[var(--bg-2)] text-[var(--fg-1)]">
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
