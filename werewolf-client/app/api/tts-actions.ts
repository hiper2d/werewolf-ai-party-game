'use server';

import { auth } from "@/auth";
import { getUserApiKeys } from "@/app/api/user-actions";
import { OpenAI } from "openai";
import { API_KEY_CONSTANTS, AUDIO_MODEL_CONSTANTS } from "@/app/ai/ai-models";
import { calculateOpenAITtsCost } from "@/app/utils/pricing";
import { updateUserMonthlySpending } from "@/app/api/user-actions";
import { recordGameCost } from "@/app/api/cost-tracking";

export interface TTSOptions {
  voice?: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer' | 'ash' | 'ballad' | 'coral' | 'sage';
  instructions?: string;
  speed?: number;
  format?: 'mp3' | 'wav' | 'opus' | 'aac' | 'flac' | 'pcm';
  gameId?: string;
}

export async function generateSpeech(
  text: string, 
  options: TTSOptions = {}
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
    const openaiApiKey = apiKeys[API_KEY_CONSTANTS.OPENAI];
    
    if (!openaiApiKey) {
      throw new Error('OpenAI API key not found. Please add your OpenAI API key in your profile.');
    }

    // Initialize OpenAI client
    const client = new OpenAI({ 
      apiKey: openaiApiKey
    });

    // Generate speech
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

    const cost = calculateOpenAITtsCost(text.length);
    if (cost > 0) {
      await updateUserMonthlySpending(session.user.email, cost);
      if (options.gameId) {
        await recordGameCost(options.gameId, cost);
      }
    }

    // Return the audio data as ArrayBuffer
    return await response.arrayBuffer();
  } catch (error) {
    console.error('TTS Error:', error);
    if (error instanceof Error) {
      throw new Error(`Failed to generate speech: ${error.message}`);
    }
    throw new Error('Failed to generate speech: Unknown error');
  }
}
