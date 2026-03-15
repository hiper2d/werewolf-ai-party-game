'use client';

import React, { useState } from 'react';
import { SupportedAiModels } from '@/app/ai/ai-models';
import { UserTier } from '@/app/api/game-models';
import { updateUserTier } from '@/app/api/user-actions';

interface FreeTierPanelProps {
    userId: string;
    currentTier: UserTier;
}

export default function FreeTierPanel({ userId, currentTier }: FreeTierPanelProps) {
    const [isLoading, setIsLoading] = useState(false);
    const isCurrentTier = currentTier === 'free';

    const allModels = Object.entries(SupportedAiModels).map(([modelName, config]) => ({
        modelName,
        config
    }));

    const handleSwitchTier = async () => {
        if (isLoading) return;
        setIsLoading(true);
        try {
            await updateUserTier(userId, 'free');
            window.location.reload();
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
                Play with shared AI keys. Limited model selection and bot count per game.
            </p>

            {!isCurrentTier && (
                <button
                    onClick={handleSwitchTier}
                    disabled={isLoading}
                    className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded transition text-sm"
                >
                    {isLoading ? 'Switching...' : 'Switch to Free Tier'}
                </button>
            )}

            {/* Free tier model limits */}
            <div>
                <h3 className="text-lg font-bold mb-3">Free Tier Model Limits</h3>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b theme-border">
                                <th className="text-left py-2">Model</th>
                                <th className="text-right py-2">Max Bots / Game</th>
                            </tr>
                        </thead>
                        <tbody>
                            {allModels.map(({ modelName, config }, index) => {
                                const isAvailable = config.freeTier?.available || false;
                                const maxBots = config.freeTier?.maxBotsPerGame || 0;

                                let displayLimit: string;
                                if (!isAvailable) {
                                    displayLimit = 'Not available';
                                } else if (maxBots === -1) {
                                    displayLimit = 'Unlimited';
                                } else {
                                    displayLimit = maxBots.toString();
                                }

                                return (
                                    <tr key={index} className={`border-b theme-border-subtle ${!isAvailable ? 'opacity-50' : ''}`}>
                                        <td className="py-2">{config.displayName}</td>
                                        <td className="py-2 text-right text-xs">{displayLimit}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
