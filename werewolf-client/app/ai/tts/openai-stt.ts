import { OpenAI } from "openai";
import { AUDIO_MODEL_CONSTANTS } from "@/app/ai/ai-models";

export interface OpenAiSttOptions {
  language?: string;
  prompt?: string;
  temperature?: number;
  fileName?: string;   // Whisper detects the container format from the extension
  mimeType?: string;
}

export interface OpenAiSttResult {
  text: string;
  durationSeconds: number;
}

/**
 * Core OpenAI Whisper call: audio + API key in, transcript + duration out.
 * No auth, tier, or cost logic — that lives in app/api/stt-actions.ts.
 */
export async function transcribeWithOpenAi(
  audioBuffer: ArrayBuffer,
  apiKey: string,
  options: OpenAiSttOptions = {}
): Promise<OpenAiSttResult> {
  const client = new OpenAI({ apiKey });

  // Convert ArrayBuffer to File for OpenAI API
  const audioFile = new File(
    [audioBuffer],
    options.fileName || 'audio.webm',
    { type: options.mimeType || 'audio/webm' }
  );

  const transcription: any = await client.audio.transcriptions.create({
    file: audioFile,
    model: AUDIO_MODEL_CONSTANTS.STT,
    language: options.language || 'en',
    prompt: options.prompt,
    temperature: options.temperature || 0,
    response_format: 'verbose_json'
  });

  const explicitDuration = Number(transcription?.duration) || 0;
  const segments = Array.isArray(transcription?.segments) ? transcription.segments : [];
  const segmentsDuration = segments.reduce((max: number, segment: any) => {
    const end = Number(segment?.end);
    return end > max ? end : max;
  }, 0);
  const durationSeconds = explicitDuration || segmentsDuration;

  const text = typeof transcription?.text === 'string'
    ? transcription.text
    : Array.isArray(transcription?.segments)
      ? transcription.segments.map((segment: any) => segment?.text || '').join(' ')
      : '';

  return { text: text.trim(), durationSeconds };
}
