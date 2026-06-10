import { GoogleGenAI } from "@google/genai";

export interface GoogleTtsAudioOptions {
  voiceName: string;       // e.g., "Kore", "Puck"
  voiceStyle?: string;     // e.g., "mysteriously", "excitedly"
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
 * No auth, tier, or cost logic — that lives in app/api/google-tts-actions.ts.
 */
export async function generateGoogleTtsAudio(
  text: string,
  apiKey: string,
  options: GoogleTtsAudioOptions
): Promise<ArrayBuffer> {
  const client = new GoogleGenAI({ apiKey });

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

  return pcmToWav(pcmData);
}
