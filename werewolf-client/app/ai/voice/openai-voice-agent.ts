import { AUDIO_MODEL_CONSTANTS } from "@/app/ai/ai-models";
import { generateOpenAiTtsAudio, OpenAiTtsVoice } from "@/app/ai/tts/openai-tts";
import { transcribeWithOpenAi } from "@/app/ai/tts/openai-stt";
import { calculateOpenAISttCost, calculateOpenAITtsCost } from "@/app/utils/pricing";
import { SpeechRequest, SpeechResult, TranscriptionRequest, TranscriptionResult, VoiceAgent } from "./voice-agent";

/** gpt-4o-mini-tts (billed per character) + Whisper (billed per minute). */
export class OpenAiVoiceAgent implements VoiceAgent {
  readonly provider = 'openai' as const;
  readonly ttsModel = AUDIO_MODEL_CONSTANTS.TTS;
  readonly sttModel = AUDIO_MODEL_CONSTANTS.STT;

  constructor(private readonly apiKey: string) {}

  async speak(request: SpeechRequest): Promise<SpeechResult> {
    const audio = await generateOpenAiTtsAudio(request.text, this.apiKey, {
      voice: request.voice as OpenAiTtsVoice,
      instructions: request.voiceStyle || undefined,
    });
    const characters = request.text.length;
    return { audio, costUSD: calculateOpenAITtsCost(characters), usage: { characters } };
  }

  async transcribe(request: TranscriptionRequest): Promise<TranscriptionResult> {
    const { text, durationSeconds } = await transcribeWithOpenAi(request.audio, this.apiKey, {
      language: request.language,
      prompt: request.prompt,
      fileName: request.fileName,
      mimeType: request.mimeType,
    });
    return { text, durationSeconds, costUSD: calculateOpenAISttCost(durationSeconds), usage: { audioSeconds: durationSeconds } };
  }
}
