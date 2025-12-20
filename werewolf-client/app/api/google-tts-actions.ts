'use server';

import { auth } from "@/auth";
import { getUserApiKeys } from "@/app/api/user-actions";
import { GoogleGenAI } from "@google/genai";
import { API_KEY_CONSTANTS } from "@/app/ai/ai-models";
import { updateUserMonthlySpending } from "@/app/api/user-actions";
import { recordGameCost } from "@/app/api/cost-tracking";

export interface GoogleTTSOptions {
  voiceName: string;       // e.g., "Kore", "Puck"
  voiceStyle?: string;     // e.g., "mysteriously", "excitedly"
  gameId?: string;
}

// Google TTS pricing: Based on Gemini pricing model
// Estimated at similar rates to OpenAI TTS for now
// TODO: Update with actual Google TTS pricing when available
const GOOGLE_TTS_COST_PER_MILLION_CHARS = 15; // $15 per 1M characters (estimate)

function calculateGoogleTtsCost(characterCount: number): number {
  return (characterCount / 1_000_000) * GOOGLE_TTS_COST_PER_MILLION_CHARS;
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

export async function generateGoogleSpeech(
  text: string,
  options: GoogleTTSOptions
): Promise<ArrayBuffer> {
  const session = await auth();
  if (!session || !session.user?.email) {
    throw new Error('Not authenticated');
  }

  if (!text.trim()) {
    throw new Error('Text cannot be empty');
  }

  try {
    // Get user's API keys
    const apiKeys = await getUserApiKeys(session.user.email);
    const googleApiKey = apiKeys[API_KEY_CONSTANTS.GOOGLE];

    if (!googleApiKey) {
      throw new Error('Google API key not found. Please add your Google API key in your profile.');
    }

    // Initialize Google GenAI client
    const client = new GoogleGenAI({
      apiKey: googleApiKey
    });

    // Prepare the text with style instruction if provided
    let inputText = text;
    if (options.voiceStyle) {
      inputText = `Say ${options.voiceStyle}: ${text}`;
    }

    // Generate speech using Gemini TTS model
    const response = await client.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
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

    // Convert PCM to WAV
    const wavBuffer = pcmToWav(pcmData);

    // Track costs
    const cost = calculateGoogleTtsCost(text.length);
    if (cost > 0) {
      await updateUserMonthlySpending(session.user.email, cost);
      if (options.gameId) {
        await recordGameCost(options.gameId, cost);
      }
    }

    return wavBuffer;
  } catch (error) {
    console.error('Google TTS Error:', error);
    if (error instanceof Error) {
      throw new Error(`Failed to generate speech with Google TTS: ${error.message}`);
    }
    throw new Error('Failed to generate speech with Google TTS: Unknown error');
  }
}
