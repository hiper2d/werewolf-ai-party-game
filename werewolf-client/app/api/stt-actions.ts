'use server';

import { auth } from "@/auth";
import { getUserTierAndApiKeys } from "@/app/utils/tier-utils";
import { API_KEY_CONSTANTS } from "@/app/ai/ai-models";
import { transcribeWithOpenAi } from "@/app/ai/tts/openai-stt";
import { calculateOpenAISttCost } from "@/app/utils/pricing";
import { updateUserMonthlySpending, deductBalance, assertFreeTierSpendWithinLimit } from "@/app/api/user-actions";
import { recordGameCost, getGameTier } from "@/app/api/cost-tracking";
import { USER_TIERS } from "@/app/api/game-models";
import { PAID_TIER_MARKUP } from "@/app/config/credit-packages";

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
    // Resolve keys by tier: 'api' → user's personal keys, 'free'/'paid' → platform keys
    const { tier, apiKeys } = await getUserTierAndApiKeys(session.user.email);
    const openaiApiKey = apiKeys[API_KEY_CONSTANTS.OPENAI];

    if (!openaiApiKey) {
      if (tier === USER_TIERS.API) {
        throw new Error('OpenAI API key not found. Please add your OpenAI API key in your profile.');
      }
      // Free/paid users rely on platform keys (config/freeTierApiKeys) — a missing key is our misconfiguration, not theirs
      console.error(`STT: platform OpenAI API key is missing for ${tier}-tier user ${session.user.email}`);
      throw new Error('Voice transcription is temporarily unavailable. Please try again later.');
    }

    const gameTier = await getGameTier(options.gameId);
    if (gameTier === USER_TIERS.FREE) {
      await assertFreeTierSpendWithinLimit(session.user.email);
    }

    const { text, durationSeconds } = await transcribeWithOpenAi(audioBuffer, openaiApiKey, {
      language: options.language,
      prompt: options.prompt,
      temperature: options.temperature,
    });

    const cost = calculateOpenAISttCost(durationSeconds);
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

    return text;
  } catch (error) {
    console.error('STT Error:', error);
    if (error instanceof Error) {
      throw new Error(`Failed to transcribe audio: ${error.message}`);
    }
    throw new Error('Failed to transcribe audio: Unknown error');
  }
}
