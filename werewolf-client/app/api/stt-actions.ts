'use server';

import { auth } from "@/auth";
import { getUserApiKeys } from "@/app/api/user-actions";
import { OpenAI } from "openai";
import { API_KEY_CONSTANTS, AUDIO_MODEL_CONSTANTS } from "@/app/ai/ai-models";
import { calculateOpenAISttCost } from "@/app/utils/pricing";
import { updateUserMonthlySpending } from "@/app/api/user-actions";
import { recordGameCost } from "@/app/api/cost-tracking";

export interface STTOptions {
  language?: string;
  prompt?: string;
  temperature?: number;
  gameId?: string;
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

    const cost = calculateOpenAISttCost(durationSeconds);
    if (cost > 0) {
      await updateUserMonthlySpending(session.user.email, cost);
      if (options.gameId) {
        await recordGameCost(options.gameId, cost);
      }
    }

    const textOutput = typeof transcription?.text === 'string'
      ? transcription.text
      : Array.isArray(transcription?.segments)
        ? transcription.segments.map((segment: any) => segment?.text || '').join(' ')
        : '';

    return textOutput.trim();
  } catch (error) {
    console.error('STT Error:', error);
    if (error instanceof Error) {
      throw new Error(`Failed to transcribe audio: ${error.message}`);
    }
    throw new Error('Failed to transcribe audio: Unknown error');
  }
}
