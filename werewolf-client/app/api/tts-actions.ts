'use server';

import { auth } from "@/auth";
import { getUserTierAndApiKeys } from "@/app/utils/tier-utils";
import { API_KEY_CONSTANTS } from "@/app/ai/ai-models";
import { generateOpenAiTtsAudio, OpenAiTtsVoice } from "@/app/ai/tts/openai-tts";
import { calculateOpenAITtsCost } from "@/app/utils/pricing";
import { updateUserMonthlySpending, deductBalance, assertFreeTierSpendWithinLimit } from "@/app/api/user-actions";
import { recordGameCost, getGameTier } from "@/app/api/cost-tracking";
import { USER_TIERS } from "@/app/api/game-models";
import { PAID_TIER_MARKUP } from "@/app/config/credit-packages";
import { VoiceProvider } from "@/app/ai/voice-config";
import { generateGoogleSpeech, GoogleTTSOptions } from "@/app/api/google-tts-actions";

export interface TTSOptions {
  voice?: OpenAiTtsVoice;
  instructions?: string;
  speed?: number;
  format?: 'mp3' | 'wav' | 'opus' | 'aac' | 'flac' | 'pcm';
  gameId?: string;
}

/**
 * Unified TTS options that work with both providers
 */
export interface UnifiedTTSOptions {
  voice: string;           // Voice ID from config
  voiceStyle?: string;     // Style instruction (e.g., "mysteriously", "excitedly")
  voiceInstructions?: string; // Legacy: detailed voice instructions for OpenAI
  gameId?: string;
}

/**
 * Unified speech generation function that routes to the appropriate provider.
 * This is the preferred function for new code.
 */
export async function generateSpeechWithProvider(
  text: string,
  options: UnifiedTTSOptions,
  voiceProvider: VoiceProvider
): Promise<ArrayBuffer> {
  switch (voiceProvider) {
    case 'openai':
      return generateSpeech(text, {
        voice: options.voice as TTSOptions['voice'],
        instructions: options.voiceInstructions || options.voiceStyle,
        gameId: options.gameId,
      });
    case 'google':
      return generateGoogleSpeech(text, {
        voiceName: options.voice,
        voiceStyle: options.voiceStyle,
        gameId: options.gameId,
      });
    default:
      throw new Error(`Unknown voice provider: ${voiceProvider}`);
  }
}

/**
 * Generate speech using OpenAI TTS.
 * For backward compatibility - prefer generateSpeechWithProvider for new code.
 */
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
    // Resolve keys by tier: 'api' → user's personal keys, 'free'/'paid' → platform keys
    const { tier, apiKeys } = await getUserTierAndApiKeys(session.user.email);
    const openaiApiKey = apiKeys[API_KEY_CONSTANTS.OPENAI];

    if (!openaiApiKey) {
      if (tier === USER_TIERS.API) {
        throw new Error('OpenAI API key not found. Please add your OpenAI API key in your profile.');
      }
      // Free/paid users rely on platform keys (config/freeTierApiKeys) — a missing key is our misconfiguration, not theirs
      console.error(`TTS: platform OpenAI API key is missing for ${tier}-tier user ${session.user.email}`);
      throw new Error('Voice generation is temporarily unavailable. Please try again later.');
    }

    const gameTier = await getGameTier(options.gameId);
    if (gameTier === USER_TIERS.FREE) {
      await assertFreeTierSpendWithinLimit(session.user.email);
    }

    const audioBuffer = await generateOpenAiTtsAudio(text, openaiApiKey, {
      voice: options.voice,
      instructions: options.instructions,
      speed: options.speed,
      format: options.format,
    });

    const cost = calculateOpenAITtsCost(text.length);
    if (cost > 0) {
      if (gameTier === USER_TIERS.PAID) {
        const chargedAmount = parseFloat((cost * (1 + PAID_TIER_MARKUP)).toFixed(6));
        const success = await deductBalance(session.user.email, chargedAmount);
        if (!success) {
          throw new Error('Insufficient balance. Please add funds on your profile page to continue playing.');
        }
      }
      await updateUserMonthlySpending(session.user.email, cost, gameTier);
      if (options.gameId) {
        await recordGameCost(options.gameId, cost);
      }
    }

    return audioBuffer;
  } catch (error) {
    console.error('TTS Error:', error);
    if (error instanceof Error) {
      throw new Error(`Failed to generate speech: ${error.message}`);
    }
    throw new Error('Failed to generate speech: Unknown error');
  }
}
