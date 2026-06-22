'use server';

import { auth } from "@/auth";
import { getUserTierAndApiKeys } from "@/app/utils/tier-utils";
import { API_KEY_CONSTANTS } from "@/app/ai/ai-models";
import { generateGoogleTtsAudio } from "@/app/ai/tts/google-tts";
import { updateUserMonthlySpending, deductBalance, assertFreeTierSpendWithinLimit } from "@/app/api/user-actions";
import { recordGameCost, getGameTier } from "@/app/api/cost-tracking";
import { USER_TIERS } from "@/app/api/game-models";
import { PAID_TIER_MARKUP } from "@/app/config/credit-packages";

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
    // Resolve keys by tier: 'api' → user's personal keys, 'free'/'paid' → platform keys
    const { tier, apiKeys } = await getUserTierAndApiKeys(session.user.email);
    const googleApiKey = apiKeys[API_KEY_CONSTANTS.GOOGLE];

    if (!googleApiKey) {
      if (tier === USER_TIERS.API) {
        throw new Error('Google API key not found. Please add your Google API key in your profile.');
      }
      // Free/paid users rely on platform keys (config/freeTierApiKeys) — a missing key is our misconfiguration, not theirs
      console.error(`Google TTS: platform Google API key is missing for ${tier}-tier user ${session.user.email}`);
      throw new Error('Voice generation is temporarily unavailable. Please try again later.');
    }

    const gameTier = await getGameTier(options.gameId);
    if (gameTier === USER_TIERS.FREE) {
      await assertFreeTierSpendWithinLimit(session.user.email);
    }

    const wavBuffer = await generateGoogleTtsAudio(text, googleApiKey, {
      voiceName: options.voiceName,
      voiceStyle: options.voiceStyle,
    });

    // Track costs
    const cost = calculateGoogleTtsCost(text.length);
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

    return wavBuffer;
  } catch (error) {
    console.error('Google TTS Error:', error);
    if (error instanceof Error) {
      throw new Error(`Failed to generate speech with Google TTS: ${error.message}`);
    }
    throw new Error('Failed to generate speech with Google TTS: Unknown error');
  }
}
