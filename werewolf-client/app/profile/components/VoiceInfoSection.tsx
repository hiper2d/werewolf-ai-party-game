import React from 'react';
import { API_KEY_CONSTANTS, AUDIO_MODEL_CONSTANTS } from '@/app/ai/ai-models';

export default function VoiceInfoSection() {
    return (
        <div>
            <h3 className="text-xl font-bold mb-3">Voice Models (TTS/STT)</h3>
            <p className="text-sm theme-text-secondary mb-3">
                Text-to-speech and speech-to-text are available on every tier when you provide your own OpenAI key.
            </p>
            <div className="text-xs theme-text-secondary">
                <p className="mb-1"><strong>Requires:</strong> {API_KEY_CONSTANTS.OPENAI}</p>
                <p className="mb-1"><strong>TTS:</strong> {AUDIO_MODEL_CONSTANTS.TTS} ($15 per 1M characters)</p>
                <p className="mb-1"><strong>STT:</strong> {AUDIO_MODEL_CONSTANTS.STT} ($0.006 per audio minute)</p>
                <p className="mt-2">Usage is recorded in your monthly spendings.</p>
            </div>
        </div>
    );
}
