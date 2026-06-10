import { OpenAI } from "openai";
import { AUDIO_MODEL_CONSTANTS } from "@/app/ai/ai-models";

export type OpenAiTtsVoice = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer' | 'ash' | 'ballad' | 'coral' | 'sage';

export interface OpenAiTtsAudioOptions {
  voice?: OpenAiTtsVoice;
  instructions?: string;
  speed?: number;
  format?: 'mp3' | 'wav' | 'opus' | 'aac' | 'flac' | 'pcm';
}

/**
 * Core OpenAI TTS call: text + API key in, audio bytes out.
 * No auth, tier, or cost logic — that lives in app/api/tts-actions.ts.
 */
export async function generateOpenAiTtsAudio(
  text: string,
  apiKey: string,
  options: OpenAiTtsAudioOptions = {}
): Promise<ArrayBuffer> {
  const client = new OpenAI({ apiKey });

  const speechOptions: any = {
    model: AUDIO_MODEL_CONSTANTS.TTS,
    voice: options.voice || 'alloy',
    input: text,
    speed: options.speed || 1.0,
    response_format: options.format || 'wav', // Default to WAV for faster playback
  };

  // Add instructions if provided (only supported in gpt-4o-mini-tts model)
  if (options.instructions) {
    speechOptions.instructions = options.instructions;
  }

  const response = await client.audio.speech.create(speechOptions);
  return await response.arrayBuffer();
}
