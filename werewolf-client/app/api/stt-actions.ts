'use server';

import { auth } from "@/auth";
import { getUserTierAndApiKeys } from "@/app/utils/tier-utils";
import { updateUserMonthlySpending, deductBalance, assertFreeTierSpendWithinLimit } from "@/app/api/user-actions";
import { recordGameCost, getGameTier } from "@/app/api/cost-tracking";
import { USER_TIERS } from "@/app/api/game-models";
import { PAID_TIER_MARKUP } from "@/app/config/credit-packages";
import { getDefaultVoiceProvider, SUPPORTED_VOICE_PROVIDERS, VoiceProvider } from "@/app/ai/voice-config";
import { createVoiceAgent, VOICE_PROVIDER_API_KEY } from "@/app/ai/voice";

export interface STTOptions {
  language?: string;
  prompt?: string;
  temperature?: number;
  gameId?: string;
  // The game's voice set decides the transcription model too (Whisper for
  // OpenAI, Gemini Transcribe for Gemini). Absent = the default provider.
  voiceProvider?: VoiceProvider;
  mimeType?: string;
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
  const voiceProvider = options.voiceProvider ?? getDefaultVoiceProvider();
  if (!SUPPORTED_VOICE_PROVIDERS.includes(voiceProvider)) {
    throw new Error(`Unknown voice provider: ${voiceProvider}`);
  }

  try {
    // All tiers run on platform keys (config/freeTierApiKeys)
    const { apiKeys } = await getUserTierAndApiKeys(session.user.email);
    const apiKey = apiKeys[VOICE_PROVIDER_API_KEY[voiceProvider]];
    if (!apiKey) {
      // A missing platform key is our misconfiguration, not the user's
      console.error(`STT: platform ${voiceProvider} API key is missing (user ${session.user.email})`);
      throw new Error('Voice transcription is temporarily unavailable. Please try again later.');
    }

    const gameTier = await getGameTier(options.gameId);
    if (gameTier === USER_TIERS.FREE) {
      await assertFreeTierSpendWithinLimit(session.user.email);
    }

    const agent = createVoiceAgent(voiceProvider, apiKey);
    const { text, costUSD } = await agent.transcribe({
      audio: audioBuffer,
      mimeType: options.mimeType,
      language: options.language,
      prompt: options.prompt,
    });

    if (costUSD > 0) {
      if (gameTier === USER_TIERS.PAID) {
        const chargedAmount = parseFloat((costUSD * (1 + PAID_TIER_MARKUP)).toFixed(6));
        const success = await deductBalance(session.user.email, chargedAmount);
        if (!success) {
          throw new Error('Insufficient balance. Please add funds on your profile page to continue playing.');
        }
      }
      await updateUserMonthlySpending(session.user.email, costUSD, gameTier);
      if (options.gameId) {
        await recordGameCost(options.gameId, costUSD);
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
