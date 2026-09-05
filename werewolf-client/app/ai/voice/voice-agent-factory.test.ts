import { createVoiceAgent, VOICE_PROVIDER_API_KEY } from "./voice-agent-factory";
import { OpenAiVoiceAgent } from "./openai-voice-agent";
import { GoogleVoiceAgent } from "./google-voice-agent";
import { AUDIO_MODEL_CONSTANTS, API_KEY_CONSTANTS } from "@/app/ai/ai-models";
import { SUPPORTED_VOICE_PROVIDERS } from "@/app/ai/voice-config";
import { calculateGoogleSttCost } from "@/app/utils/pricing";

describe('createVoiceAgent', () => {
  it('returns the provider agent with its speech and transcription models', () => {
    const openai = createVoiceAgent('openai', 'k');
    expect(openai).toBeInstanceOf(OpenAiVoiceAgent);
    expect(openai.ttsModel).toBe(AUDIO_MODEL_CONSTANTS.TTS);
    expect(openai.sttModel).toBe(AUDIO_MODEL_CONSTANTS.STT);

    const google = createVoiceAgent('google', 'k');
    expect(google).toBeInstanceOf(GoogleVoiceAgent);
    expect(google.ttsModel).toBe('gemini-3.1-flash-tts-preview');
    expect(google.sttModel).toBe('gemini-3.5-transcribe');
  });

  it('rejects unknown providers', () => {
    expect(() => createVoiceAgent('azure' as any, 'k')).toThrow('Unknown voice provider');
  });

  it('maps every supported provider to a platform key name', () => {
    for (const provider of SUPPORTED_VOICE_PROVIDERS) {
      expect(VOICE_PROVIDER_API_KEY[provider]).toBeTruthy();
    }
    expect(VOICE_PROVIDER_API_KEY.openai).toBe(API_KEY_CONSTANTS.OPENAI);
    expect(VOICE_PROVIDER_API_KEY.google).toBe(API_KEY_CONSTANTS.GOOGLE);
  });
});

describe('calculateGoogleSttCost', () => {
  it('prices audio input and text output tokens at their own rates', () => {
    // $2/M audio in + $12/M text out; one minute ≈ 1500 audio + 175 text tokens ≈ $0.005
    expect(calculateGoogleSttCost({ inputTokens: 1_000_000, outputTokens: 0 })).toBeCloseTo(2, 10);
    expect(calculateGoogleSttCost({ inputTokens: 0, outputTokens: 1_000_000 })).toBeCloseTo(12, 10);
    expect(calculateGoogleSttCost({ inputTokens: 1500, outputTokens: 175 })).toBeCloseTo(0.003 + 0.0021, 10);
  });
});
