'use server';

import { auth } from "@/auth";
import { getUserApiKeys } from "@/app/api/user-actions";
import { OpenAI } from "openai";
import { API_KEY_CONSTANTS } from "@/app/ai/ai-models";

export interface TTSOptions {
  voice?: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
  speed?: number;
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
    const response = await client.audio.speech.create({
      model: 'tts-1',
      voice: options.voice || 'alloy',
      input: text,
      speed: options.speed || 1.0,
    });

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