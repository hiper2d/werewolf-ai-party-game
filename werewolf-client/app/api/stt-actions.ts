'use server';

import { auth } from "@/auth";
import { getUserApiKeys } from "@/app/api/user-actions";
import { OpenAI } from "openai";
import { API_KEY_CONSTANTS } from "@/app/ai/ai-models";

export interface STTOptions {
  language?: string;
  prompt?: string;
  temperature?: number;
}

export async function transcribeAudio(
  audioBuffer: ArrayBuffer,
  options: STTOptions = {}
): Promise<string> {
  const session = await auth();
  if (!session || !session.user?.email) {
    throw new Error('Not authenticated');
  }

  if (!audioBuffer || audioBuffer.byteLength === 0) {
    throw new Error('Audio data cannot be empty');
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

    // Convert ArrayBuffer to File for OpenAI API
    const audioFile = new File([audioBuffer], 'audio.webm', { type: 'audio/webm' });

    // Transcribe audio
    const response = await client.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1', // Using Whisper model for transcription
      language: options.language || 'en',
      prompt: options.prompt,
      temperature: options.temperature || 0,
      response_format: 'text'
    });

    return String(response).trim();
  } catch (error) {
    console.error('STT Error:', error);
    if (error instanceof Error) {
      throw new Error(`Failed to transcribe audio: ${error.message}`);
    }
    throw new Error('Failed to transcribe audio: Unknown error');
  }
}