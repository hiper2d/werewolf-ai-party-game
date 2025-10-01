import {AUDIO_MODEL_CONSTANTS, AUDIO_MODEL_PRICING} from "@/app/ai/ai-models";

function roundUSD(value: number): number {
    return parseFloat((value || 0).toFixed(6));
}

export function calculateOpenAITtsCost(characterCount: number): number {
    if (!characterCount || characterCount <= 0) {
        return 0;
    }
    const pricing = AUDIO_MODEL_PRICING[AUDIO_MODEL_CONSTANTS.TTS];
    const rate = pricing?.pricePerMillionCharacters;
    if (!rate || rate <= 0) {
        console.warn('No pricing available for OpenAI TTS model');
        return 0;
    }

    const cost = (characterCount / 1_000_000) * rate;
    return roundUSD(cost);
}

export function calculateOpenAISttCost(durationSeconds: number): number {
    if (!durationSeconds || durationSeconds <= 0) {
        return 0;
    }
    const pricing = AUDIO_MODEL_PRICING[AUDIO_MODEL_CONSTANTS.STT];
    const rate = pricing?.pricePerMinute;
    if (!rate || rate <= 0) {
        console.warn('No pricing available for OpenAI STT model');
        return 0;
    }

    const minutes = durationSeconds / 60;
    const cost = minutes * rate;
    return roundUSD(cost);
}
