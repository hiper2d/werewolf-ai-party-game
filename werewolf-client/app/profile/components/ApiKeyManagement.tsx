'use client';

import React, { useState } from 'react';
import ApiKeyList from './ApiKeyList';
import AddApiKeyForm from './AddApiKeyForm';
import { ApiKeyMap } from '@/app/api/game-models';
import { MODEL_PRICING, SupportedAiModels, API_KEY_CONSTANTS } from '@/app/ai/ai-models';
import { updateUserTier } from '@/app/api/user-actions';
import { useRouter } from 'next/navigation';

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
        return {
            name: modelName,
            inputPrice: pricing?.inputPrice || 0,
            outputPrice: pricing?.outputPrice || 0,
        };
    }).filter(model => model.inputPrice > 0 || model.outputPrice > 0);

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
                                    <td className="py-2 text-right">${model.inputPrice.toFixed(2)}</td>
                                    <td className="py-2 text-right">${model.outputPrice.toFixed(2)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <p className="text-xs text-gray-400 mt-2">* Per million tokens</p>
                </div>

                {/* TTS/STT Options */}
                <div className="bg-black bg-opacity-20 border border-white border-opacity-20 rounded p-4">
                    <h3 className="text-xl font-bold mb-4">Voice Options (TTS/STT)</h3>
                    <p className="text-sm text-gray-300 mb-3">
                        Currently, only OpenAI provides Text-to-Speech (TTS) and Speech-to-Text (STT) capabilities.
                    </p>
                    <div className="text-xs text-gray-400">
                        <p className="mb-2"><strong>Available with:</strong> {API_KEY_CONSTANTS.OPENAI}</p>
                        <p className="mb-1"><strong>TTS Models:</strong> tts-1, tts-1-hd</p>
                        <p><strong>STT Models:</strong> whisper-1</p>
                    </div>
                </div>
            </div>

            <div className="p-4 border-t border-white border-opacity-30">
                <AddApiKeyForm userId={userId} />
            </div>
        </>
    );
}
