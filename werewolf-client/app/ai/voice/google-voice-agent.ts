import { AUDIO_MODEL_CONSTANTS } from "@/app/ai/ai-models";
import { generateGoogleTtsAudio } from "@/app/ai/tts/google-tts";
import { transcribeWithGemini } from "@/app/ai/tts/google-stt";
import { calculateGoogleSttCost, calculateGoogleTtsCost } from "@/app/utils/pricing";
import { SpeechRequest, SpeechResult, TranscriptionRequest, TranscriptionResult, VoiceAgent } from "./voice-agent";

/** Gemini 3.1 Flash TTS + Gemini 3.5 Transcribe, both billed per token. */
export class GoogleVoiceAgent implements VoiceAgent {
  readonly provider = 'google' as const;
  readonly ttsModel = AUDIO_MODEL_CONSTANTS.GOOGLE_TTS;
  readonly sttModel = AUDIO_MODEL_CONSTANTS.GOOGLE_STT;

  constructor(private readonly apiKey: string) {}

  async speak(request: SpeechRequest): Promise<SpeechResult> {
    const { audio, usage } = await generateGoogleTtsAudio(request.text, this.apiKey, {
      voiceName: request.voice,
      voiceStyle: request.voiceStyle,
    });
    return { audio, costUSD: calculateGoogleTtsCost(usage), usage };
  }

  async transcribe(request: TranscriptionRequest): Promise<TranscriptionResult> {
    const { text, durationSeconds, usage } = await transcribeWithGemini(request.audio, this.apiKey, { mimeType: request.mimeType });
    return { text, durationSeconds, costUSD: calculateGoogleSttCost(usage), usage };
  }
}
