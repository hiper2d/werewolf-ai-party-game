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
            <p className="text-sm text-[var(--fg-1)] mb-4">
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
                                    ? 'border-[var(--accent-line)] bg-[var(--accent-soft)]'
                                    : isUnsupported
                                        ? 'border-[var(--line-1)] opacity-60 bg-[var(--bg-2)]'
                                        : 'border-[var(--line-2)] hover:border-[var(--accent-line)]'
                            } ${isUpdating || isUnsupported ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                        >
                            <div className="flex items-center justify-between">
                                <div>
                                    <span className="font-semibold text-lg">
                                        {VOICE_PROVIDER_DISPLAY_NAMES[provider]}
                                        {isUnsupported && (
                                            <span className="ml-2 text-xs font-normal text-[var(--fg-2)] bg-[var(--accent-soft)] px-2 py-0.5 rounded border border-[var(--accent-line)]/30">
                                                Coming Soon
                                            </span>
                                        )}
                                    </span>
                                    <p className="text-sm text-[var(--fg-1)] mt-1">
                                        {VOICE_PROVIDER_DESCRIPTIONS[provider]}
                                    </p>
                                </div>
                                {selectedProvider === provider && (
                                    <span className="text-[var(--gm-fg)] text-xl">&#10003;</span>
                                )}
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
