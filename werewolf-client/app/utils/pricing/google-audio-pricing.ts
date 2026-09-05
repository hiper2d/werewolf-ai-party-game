import { AUDIO_MODEL_CONSTANTS, AUDIO_MODEL_PRICING } from "@/app/ai/ai-models";

export interface GoogleTtsUsage {
    inputTokens: number;   // text prompt tokens
    outputTokens: number;  // audio tokens
}

/** USD cost of one Gemini TTS call from its reported token usage. */
export function calculateGoogleTtsCost(usage: GoogleTtsUsage): number {
    const pricing = AUDIO_MODEL_PRICING[AUDIO_MODEL_CONSTANTS.GOOGLE_TTS];
    const inputRate = pricing?.textInputPricePerM ?? 0;
    const outputRate = pricing?.audioOutputPricePerM ?? 0;
    if (!inputRate && !outputRate) {
        console.warn('No pricing available for Google TTS model');
        return 0;
    }
    const inputTokens = Math.max(0, usage.inputTokens || 0);
    const outputTokens = Math.max(0, usage.outputTokens || 0);
    return (inputTokens / 1_000_000) * inputRate + (outputTokens / 1_000_000) * outputRate;
}

export interface GoogleSttUsage {
    inputTokens: number;   // audio tokens (~25 per second)
    outputTokens: number;  // transcript text tokens
}

/** USD cost of one Gemini transcription from its reported token usage. */
export function calculateGoogleSttCost(usage: GoogleSttUsage): number {
    const pricing = AUDIO_MODEL_PRICING[AUDIO_MODEL_CONSTANTS.GOOGLE_STT];
    const inputRate = pricing?.audioInputPricePerM ?? 0;
    const outputRate = pricing?.textOutputPricePerM ?? 0;
    if (!inputRate && !outputRate) {
        console.warn('No pricing available for Google STT model');
        return 0;
    }
    const inputTokens = Math.max(0, usage.inputTokens || 0);
    const outputTokens = Math.max(0, usage.outputTokens || 0);
    return (inputTokens / 1_000_000) * inputRate + (outputTokens / 1_000_000) * outputRate;
}
