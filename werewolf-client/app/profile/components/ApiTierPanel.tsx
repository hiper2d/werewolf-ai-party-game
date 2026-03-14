'use client';

import React, { useState } from 'react';
import ApiKeyList from './ApiKeyList';
import { ApiKeyMap, UserTier } from '@/app/api/game-models';
import { updateUserTier } from '@/app/api/user-actions';
import { useRouter } from 'next/navigation';
interface ApiTierPanelProps {
    userId: string;
    currentTier: UserTier;
    apiKeys: ApiKeyMap;
}

export default function ApiTierPanel({ userId, currentTier, apiKeys }: ApiTierPanelProps) {
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();
    const isCurrentTier = currentTier === 'api';

    const handleSwitchTier = async () => {
        if (isLoading) return;
        setIsLoading(true);
        try {
            await updateUserTier(userId, 'api');
            router.refresh();
        } catch (error) {
            console.error('Failed to switch tier:', error);
            alert('Failed to switch tier. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <p className="theme-text-secondary text-sm">
                Bring your own API keys. All models unlocked, no bot limits.
            </p>

            {!isCurrentTier && (
                <button
                    onClick={handleSwitchTier}
                    disabled={isLoading}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded transition text-sm"
                >
                    {isLoading ? 'Switching...' : 'Switch to API Tier'}
                </button>
            )}

            {/* API Key Management */}
            <div>
                <h3 className="text-lg font-bold mb-3">Your API Keys</h3>
                <ApiKeyList initialApiKeys={apiKeys} userId={userId} />
            </div>
        </div>
    );
}
