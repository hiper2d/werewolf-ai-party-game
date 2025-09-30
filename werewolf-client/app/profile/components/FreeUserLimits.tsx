'use client';

import React, { useState } from 'react';
import { SupportedAiModels, MODEL_PRICING } from '@/app/ai/ai-models';
import { updateUserTier } from '@/app/api/user-actions';
import { useRouter } from 'next/navigation';

export default function FreeUserLimits({ userId }: { userId: string }) {
    // Get all models, not just free tier ones
    const allModels = Object.entries(SupportedAiModels).map(([modelName, config]) => ({
        modelName,
        config
    }));

    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();

    const handleSwitchToApiTier = async () => {
        if (isLoading) return;
        setIsLoading(true);
        try {
            await updateUserTier(userId, 'api');
            router.refresh(); // Refresh the page to show API tier UI
        } catch (error) {
            console.error('Failed to switch tier:', error);
            alert('Failed to switch tier. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <>
            <div className="p-4">
                <h2 className="text-2xl font-bold mb-4">Free Tier</h2>
                <p className="text-gray-300 text-sm">
                    You are currently on the free tier. You can use the following models without providing API keys.
                    Each model has a limit on how many bots (including the Game Master) can use it in a single game.
                </p>
            </div>

            <div className="flex-grow overflow-auto p-4 space-y-6">
                {/* Available Models Section */}
                <div className="bg-black bg-opacity-20 border border-white border-opacity-20 rounded p-4">
                    <h3 className="text-xl font-bold mb-4">Available Models</h3>
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-white border-opacity-30">
                                <th className="text-left py-2">Model</th>
                                <th className="text-right py-2">Max Bots / Game</th>
                                <th className="text-right py-2">Input Cost*</th>
                                <th className="text-right py-2">Output Cost*</th>
                            </tr>
                        </thead>
                        <tbody>
                            {allModels.map(({ modelName, config }, index) => {
                                const pricing = MODEL_PRICING[config.modelApiName];
                                const isAvailable = config.freeTier?.available || false;
                                const maxBots = config.freeTier?.maxBotsPerGame || 0;

                                let displayLimit: string;
                                if (!isAvailable) {
                                    displayLimit = 'Not available in Free Tier';
                                } else if (maxBots === -1) {
                                    displayLimit = 'Unlimited';
                                } else {
                                    displayLimit = maxBots.toString();
                                }

                                return (
                                    <tr key={index} className={`border-b border-white border-opacity-10 ${!isAvailable ? 'opacity-50' : ''}`}>
                                        <td className="py-2">{modelName}</td>
                                        <td className="py-2 text-right text-xs">{displayLimit}</td>
                                        <td className="py-2 text-right">${pricing?.inputPrice.toFixed(2) || '0.00'}</td>
                                        <td className="py-2 text-right">${pricing?.outputPrice.toFixed(2) || '0.00'}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    <p className="text-xs text-gray-400 mt-2">* Per million tokens</p>
                </div>

                {/* Upgrade Notice */}
                <div className="bg-black bg-opacity-20 border border-yellow-500 border-opacity-40 rounded p-4">
                    <h3 className="text-xl font-bold mb-2 text-yellow-400">Want More?</h3>
                    <p className="text-sm text-gray-300 mb-3">
                        Switch to the API tier to:
                    </p>
                    <ul className="text-sm text-gray-300 space-y-1 ml-4 list-disc">
                        <li>Access all available AI models</li>
                        <li>Remove usage limits per game</li>
                        <li>Use your own API keys for full control</li>
                        <li>Enable TTS (Text-to-Speech) and STT (Speech-to-Text)</li>
                    </ul>
                    <button
                        onClick={handleSwitchToApiTier}
                        disabled={isLoading}
                        className="mt-4 px-4 py-2 bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded transition"
                    >
                        {isLoading ? 'Switching...' : 'Switch to API Tier'}
                    </button>
                </div>
            </div>
        </>
    );
}