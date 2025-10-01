'use client';

import React, { useState } from 'react';
import ApiKeyList from './ApiKeyList';
import AddApiKeyForm from './AddApiKeyForm';
import { ApiKeyMap } from '@/app/api/game-models';
import { MODEL_PRICING, SupportedAiModels, API_KEY_CONSTANTS, AUDIO_MODEL_CONSTANTS, ModelPricing } from '@/app/ai/ai-models';
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

export default function ApiKeyManagement({ initialApiKeys, userId }: { initialApiKeys: ApiKeyMap; userId: string }) {
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();

    const handleSwitchToFreeTier = async () => {
        if (isLoading) return;
        setIsLoading(true);
        try {
            await updateUserTier(userId, 'free');
            router.refresh(); // Refresh the page to show Free tier UI
        } catch (error) {
            console.error('Failed to switch tier:', error);
            alert('Failed to switch tier. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    // Create a flat list of all models with their pricing
    const allModels = Object.entries(SupportedAiModels).map(([modelName, config]) => {
        const pricing = MODEL_PRICING[config.modelApiName];
        const baseInputPrice = pricing?.inputPrice || 0;
        const baseOutputPrice = pricing?.outputPrice || 0;

        const inputDisplay = getPriceDisplay(pricing, 'input');
        const outputDisplay = getPriceDisplay(pricing, 'output');

        return {
            name: modelName,
            baseInputPrice,
            baseOutputPrice,
            inputDisplay,
            outputDisplay
        };
    }).filter(model => model.baseInputPrice > 0 || model.baseOutputPrice > 0);

    return (
        <>
            <div className="p-4 border-b border-white border-opacity-20">
                <div className="flex justify-between items-start gap-4">
                    <div className="flex-1">
                        <h2 className="text-2xl font-bold mb-2">API Key Management</h2>
                        <p className="text-gray-300 text-sm">
                            Add your API keys to access all available AI models with no usage limits.
                        </p>
                    </div>
                    <button
                        onClick={handleSwitchToFreeTier}
                        disabled={isLoading}
                        className="px-3 py-1.5 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-800 disabled:cursor-not-allowed text-white text-sm rounded transition whitespace-nowrap flex-shrink-0"
                    >
                        {isLoading ? 'Switching...' : 'Switch to Free Tier'}
                    </button>
                </div>
            </div>

            <div className="flex-grow overflow-auto p-4 space-y-6">
                {/* Current API Keys */}
                <div className="bg-black bg-opacity-20 border border-white border-opacity-20 rounded p-4">
                    <h3 className="text-xl font-bold mb-4">Your API Keys</h3>
                    <ApiKeyList initialApiKeys={initialApiKeys} userId={userId} />
                </div>

                {/* Model Pricing Information - Single Table */}
                <div className="bg-black bg-opacity-20 border border-white border-opacity-20 rounded p-4">
                    <h3 className="text-xl font-bold mb-4">Available Models</h3>
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-white border-opacity-30">
                                <th className="text-left py-2">Model</th>
                                <th className="text-right py-2">Input Cost*</th>
                                <th className="text-right py-2">Output Cost*</th>
                            </tr>
                        </thead>
                        <tbody>
                            {allModels.map((model, index) => (
                                <tr key={index} className="border-b border-white border-opacity-10">
                                    <td className="py-2">{model.name}</td>
                                    <td className="py-2 text-right">
                                        <div>{model.inputDisplay.base}</div>
                                        {model.inputDisplay.extended && (
                                            <div className="text-xs text-gray-400">{model.inputDisplay.extended}</div>
                                        )}
                                    </td>
                                    <td className="py-2 text-right">
                                        <div>{model.outputDisplay.base}</div>
                                        {model.outputDisplay.extended && (
                                            <div className="text-xs text-gray-400">{model.outputDisplay.extended}</div>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <p className="text-xs text-gray-400 mt-2">* Per million tokens (extended context rates shown when available)</p>
                </div>

                {/* TTS/STT Options */}
                <div className="bg-black bg-opacity-20 border border-white border-opacity-20 rounded p-4">
                    <h3 className="text-xl font-bold mb-4">Voice Options (TTS/STT)</h3>
                    <p className="text-sm text-gray-300 mb-3">
                        Currently, only OpenAI provides Text-to-Speech (TTS) and Speech-to-Text (STT) capabilities.
                    </p>
                    <div className="text-xs text-gray-400">
                        <p className="mb-2"><strong>Available with:</strong> {API_KEY_CONSTANTS.OPENAI}</p>
                        <p className="mb-1"><strong>TTS Model:</strong> {AUDIO_MODEL_CONSTANTS.TTS}</p>
                        <p><strong>STT Model:</strong> {AUDIO_MODEL_CONSTANTS.STT}</p>
                    </div>
                </div>
            </div>

            <div className="p-4 border-t border-white border-opacity-30">
                <AddApiKeyForm userId={userId} />
            </div>
        </>
    );
}
