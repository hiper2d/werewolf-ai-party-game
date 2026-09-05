import { GoogleGenAI } from "@google/genai";
import { AUDIO_MODEL_CONSTANTS } from "@/app/ai/ai-models";

export interface GoogleTtsAudioOptions {
  voiceName: string;       // e.g., "Kore", "Puck"
  voiceStyle?: string;     // e.g., "mysteriously", "excitedly", or a longer direction
}

export interface GoogleTtsResult {
  audio: ArrayBuffer;      // WAV, 24kHz mono 16-bit
  usage: { inputTokens: number; outputTokens: number }; // text prompt tokens / audio tokens
}

// Gemini reports ~32 audio tokens per second of speech (measured 2026-09-05:
// 267-304 tokens for 8-10s). Used only when the response carries no usage.
const AUDIO_TOKENS_PER_SECOND = 32;
const PCM_BYTES_PER_SECOND = 24000 * 2;

/**
 * Gemini TTS has no instruction field: delivery is directed in the text itself,
 * "Say cheerfully: Have a wonderful day!" in the docs. A short style (the 1-3
 * word adverb the story generator writes for every character) becomes that
 * "Say X:" prefix; a longer direction is used as written, ending in the colon
 * that separates the direction from the line to read. The same voiceStyle
 * field feeds OpenAI's `instructions`, so one value works for both providers.
 */
export function buildGoogleTtsPrompt(text: string, voiceStyle?: string): string {
  const style = voiceStyle?.trim().replace(/[:.!,;\s]+$/, '');
  if (!style) return text;
  const isShort = style.split(/\s+/).length <= 3 && !/[.!?,;]/.test(style);
  return isShort ? `Say ${style}: ${text}` : `${style}:\n${text}`;
}

/**
 * Converts PCM audio data to WAV format
 * PCM format from Google: 24kHz, mono, 16-bit
 */
function pcmToWav(pcmData: Uint8Array): ArrayBuffer {
  const sampleRate = 24000;
  const numChannels = 1;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = pcmData.length;
  const headerSize = 44;
  const totalSize = headerSize + dataSize;

  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);

  // RIFF header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, totalSize - 8, true);
  writeString(view, 8, 'WAVE');

  // fmt subchunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true);  // AudioFormat (1 for PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  // data subchunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // Copy PCM data
  const uint8View = new Uint8Array(buffer, headerSize);
  uint8View.set(pcmData);

  return buffer;
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

/**
 * Core Google TTS call: text + API key in, WAV audio bytes out.
 * No auth, tier, or cost logic — that lives in app/api/tts-actions.ts (via the voice agent factory).
 */
export async function generateGoogleTtsAudio(
  text: string,
  apiKey: string,
  options: GoogleTtsAudioOptions
): Promise<GoogleTtsResult> {
  const client = new GoogleGenAI({ apiKey });

  const inputText = buildGoogleTtsPrompt(text, options.voiceStyle);

  // generateContent (not the newer interactions API): both serve the 3.1 TTS
  // model (verified 2026-09-05), and this one is typed in the installed SDK
  // and reports usageMetadata, which the billing below needs.
  const response = await client.models.generateContent({
    model: AUDIO_MODEL_CONSTANTS.GOOGLE_TTS,
    contents: [{ parts: [{ text: inputText }] }],
    config: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: options.voiceName },
        },
      },
    } as any, // Type assertion needed for TTS-specific config
  });

  // Extract audio data from response
  const candidates = (response as any).candidates;
  if (!candidates || candidates.length === 0) {
    throw new Error('No audio response from Google TTS');
  }

  const content = candidates[0].content;
  if (!content || !content.parts || content.parts.length === 0) {
    throw new Error('No audio content in response');
  }

  // Find the audio part (inline_data with audio MIME type)
  let audioData: string | null = null;
  for (const part of content.parts) {
    if (part.inlineData && part.inlineData.mimeType?.startsWith('audio/')) {
      audioData = part.inlineData.data;
      break;
    }
  }

  if (!audioData) {
    throw new Error('No audio data found in response');
  }

  // Decode base64 audio data
  const binaryString = atob(audioData);
  const pcmData = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    pcmData[i] = binaryString.charCodeAt(i);
  }

  // Token usage drives billing ($/1M text in, $/1M audio out). Audio tokens
  // are the candidates count; if the response carries none, estimate from the
  // audio length rather than bill zero.
  const usageMetadata = (response as any).usageMetadata ?? {};
  const inputTokens: number = usageMetadata.promptTokenCount ?? 0;
  const reportedOutput: number | undefined = usageMetadata.candidatesTokenCount;
  const outputTokens = reportedOutput && reportedOutput > 0
    ? reportedOutput
    : Math.ceil((pcmData.length / PCM_BYTES_PER_SECOND) * AUDIO_TOKENS_PER_SECOND);

  return { audio: pcmToWav(pcmData), usage: { inputTokens, outputTokens } };
}
