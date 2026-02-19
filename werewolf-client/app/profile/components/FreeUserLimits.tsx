'use client';

import React, { useState } from 'react';
import { SupportedAiModels, MODEL_PRICING, ModelPricing, AUDIO_MODEL_CONSTANTS, API_KEY_CONSTANTS } from '@/app/ai/ai-models';
import { updateUserTier } from '@/app/api/user-actions';
import { useRouter } from 'next/navigation';

type PriceDisplay = {
    base: string;
    extended?: string;
};

const getPriceDisplay = (pricing: ModelPricing | undefined, type: 'input' | 'output'): PriceDisplay => {
    if (!pricing) {
        return { base: '$0.00' };
    }

    const basePrice = type === 'input' ? pricing.inputPrice : pricing.outputPrice;
    if (basePrice === undefined) {
        return { base: '$0.00' };
    }

    const extendedPrice = type === 'input' ? pricing.extendedContextInputPrice : pricing.extendedContextOutputPrice;
    const threshold = pricing.extendedContextThresholdTokens;

    if (extendedPrice !== undefined && threshold !== undefined) {
        return {
            base: `$${basePrice.toFixed(2)}`,
            extended: `Extended (>${threshold.toLocaleString()} ctx tokens): $${extendedPrice.toFixed(2)}`
        };
    }

    return { base: `$${basePrice.toFixed(2)}` };
};

export default function FreeUserLimits({ userId }: { userId: string }) {
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
            router.refresh();
        } catch (error) {
            console.error('Failed to switch tier:', error);
            alert('Failed to switch tier. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <>
            <div className="mb-4">
                <h2 className="text-2xl font-bold mb-2">Free Tier</h2>
                <p className="theme-text-secondary text-sm">
                    You are currently on the free tier. You can use the following models without providing API keys.
                    Each model has a limit on how many bots (including the Game Master) can use it in a single game.
                </p>
                <p className="theme-text-secondary text-xs mt-2">
                    TTS (text-to-speech) and STT (speech-to-text) are available on every tier when you provide your own OpenAI key.
                </p>
            </div>

            <div className="space-y-6">
                {/* Available Models Section */}
                <div>
                    <h3 className="text-xl font-bold mb-4">Available Models</h3>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b theme-border">
                                    <th className="text-left py-2">Model</th>
                                    <th className="text-right py-2">Max Bots / Game</th>
                                    <th className="text-right py-2">Input Cost*</th>
                                    <th className="text-right py-2">Output Cost*</th>
                                </tr>
                            </thead>
                            <tbody>
                                {allModels.map(({ modelName, config }, index) => {
                                    const pricing = MODEL_PRICING[config.modelApiName];
                                    const inputDisplay = getPriceDisplay(pricing, 'input');
                                    const outputDisplay = getPriceDisplay(pricing, 'output');
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
                                        <tr key={index} className={`border-b theme-border-subtle ${!isAvailable ? 'opacity-50' : ''}`}>
                                            <td className="py-2">{modelName}</td>
                                            <td className="py-2 text-right text-xs">{displayLimit}</td>
                                            <td className="py-2 text-right">
                                                <div>{inputDisplay.base}</div>
                                                {inputDisplay.extended && (
                                                    <div className="text-xs theme-text-secondary">{inputDisplay.extended}</div>
                                                )}
                                            </td>
                                            <td className="py-2 text-right">
                                                <div>{outputDisplay.base}</div>
                                                {outputDisplay.extended && (
                                                    <div className="text-xs theme-text-secondary">{outputDisplay.extended}</div>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    <p className="text-xs theme-text-secondary mt-2">* Per million tokens (extended context rates shown when available)</p>
                </div>

                {/* Voice Options */}
                <div className="border-t theme-border-subtle pt-4">
                    <h3 className="text-xl font-bold mb-3">Voice Options (TTS/STT)</h3>
                    <p className="text-sm theme-text-secondary mb-3">
                        Provide an OpenAI key and you can enable both text-to-speech and speech-to-text even on the free tier.
                    </p>
                    <div className="text-xs theme-text-secondary">
                        <p className="mb-1"><strong>Requires:</strong> {API_KEY_CONSTANTS.OPENAI}</p>
                        <p className="mb-1"><strong>TTS:</strong> {AUDIO_MODEL_CONSTANTS.TTS} ($15 per 1M characters)</p>
                        <p className="mb-1"><strong>STT:</strong> {AUDIO_MODEL_CONSTANTS.STT} ($0.006 per audio minute)</p>
                        <p className="mt-2">Usage is recorded in your monthly spendings.</p>
                    </div>
                </div>

                {/* Upgrade Notice */}
                <div className="border-t theme-border-subtle pt-4">
                    <h3 className="text-xl font-bold mb-2 text-yellow-600 dark:text-yellow-400">Want More?</h3>
                    <p className="text-sm theme-text-secondary mb-3">
                        Switch to the API tier to:
                    </p>
                    <ul className="text-sm theme-text-secondary space-y-1 ml-4 list-disc">
                        <li>Access all available AI models</li>
                        <li>Remove usage limits per game</li>
                        <li>Manage your API keys directly in the app</li>
                    </ul>
                    <button
                        onClick={handleSwitchToApiTier}
                        disabled={isLoading}
                        className="mt-4 px-4 py-2 bg-yellow-600 hover:bg-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded transition"
                    >
                        {isLoading ? 'Switching...' : 'Switch to API Tier'}
                    </button>
                </div>
            </div>
        </>
    );
}
