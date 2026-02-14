'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateVoiceProvider } from '@/app/api/user-actions';
import {
    VoiceProvider,
    SUPPORTED_VOICE_PROVIDERS,
    VOICE_PROVIDER_DISPLAY_NAMES,
    VOICE_PROVIDER_DESCRIPTIONS,
} from '@/app/ai/voice-config';

interface VoiceProviderSelectorProps {
    userId: string;
    initialProvider: VoiceProvider;
}

export default function VoiceProviderSelector({
    userId,
    initialProvider,
}: VoiceProviderSelectorProps) {
    const [selectedProvider, setSelectedProvider] = useState<VoiceProvider>(initialProvider);
    const [isUpdating, setIsUpdating] = useState(false);
    const router = useRouter();

    const handleProviderChange = async (provider: VoiceProvider) => {
        if (provider === selectedProvider || isUpdating) return;

        setIsUpdating(true);
        try {
            await updateVoiceProvider(userId, provider);
            setSelectedProvider(provider);
            router.refresh();
        } catch (error) {
            console.error('Failed to update voice provider:', error);
        } finally {
            setIsUpdating(false);
        }
    };

    return (
        <div className="space-y-3">
            <h3 className="text-lg font-semibold">Voice Provider</h3>
            <p className="text-sm text-gray-400 mb-4">
                Select the text-to-speech provider for new games. This setting is locked once a game is created.
            </p>
            <div className="space-y-2">
                {SUPPORTED_VOICE_PROVIDERS.map((provider) => {
                    const isUnsupported = provider === 'google';
                    return (
                        <button
                            key={provider}
                            onClick={() => !isUnsupported && handleProviderChange(provider)}
                            disabled={isUpdating || isUnsupported}
                            className={`w-full p-4 rounded border text-left transition-all ${
                                selectedProvider === provider
                                    ? 'border-green-500 bg-green-500 bg-opacity-20'
                                    : isUnsupported
                                        ? 'border-gray-700 bg-gray-800 opacity-60'
                                        : 'border-white border-opacity-30 hover:border-opacity-60'
                            } ${isUpdating || isUnsupported ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                        >
                            <div className="flex items-center justify-between">
                                <div>
                                    <span className="font-semibold text-lg">
                                        {VOICE_PROVIDER_DISPLAY_NAMES[provider]}
                                        {isUnsupported && (
                                            <span className="ml-2 text-xs font-normal text-yellow-500 bg-yellow-500 bg-opacity-10 px-2 py-0.5 rounded border border-yellow-500 border-opacity-30">
                                                Coming Soon
                                            </span>
                                        )}
                                    </span>
                                    <p className="text-sm text-gray-400 mt-1">
                                        {VOICE_PROVIDER_DESCRIPTIONS[provider]}
                                    </p>
                                </div>
                                {selectedProvider === provider && (
                                    <span className="text-green-400 text-xl">&#10003;</span>
                                )}
                            </div>
                        </button>
                    );
                })}
            </div>
            {isUpdating && (
                <p className="text-sm text-gray-400 mt-2">Updating...</p>
            )}
        </div>
    );
}
