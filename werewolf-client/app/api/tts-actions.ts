'use server';

import { auth } from "@/auth";
import { getUserTierAndApiKeys } from "@/app/utils/tier-utils";
import { updateUserMonthlySpending, deductBalance, assertFreeTierSpendWithinLimit } from "@/app/api/user-actions";
import { recordGameCost, getGameTier } from "@/app/api/cost-tracking";
import { USER_TIERS } from "@/app/api/game-models";
import { PAID_TIER_MARKUP } from "@/app/config/credit-packages";
import { SUPPORTED_VOICE_PROVIDERS, VoiceProvider } from "@/app/ai/voice-config";
import { createVoiceAgent, VOICE_PROVIDER_API_KEY } from "@/app/ai/voice";

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
 * Speech for any voice provider: resolve the platform key, pick the agent
 * through the factory, bill what it reports. The one path every spoken line
 * takes (chat playback, cinematic mode, the preview page, card auditions).
 */
export async function generateSpeechWithProvider(
  text: string,
  options: UnifiedTTSOptions,
  voiceProvider: VoiceProvider
): Promise<ArrayBuffer> {
  const session = await auth();
  if (!session || !session.user?.email) {
    throw new Error('Not authenticated');
  }
  if (!text.trim()) {
    throw new Error('Text cannot be empty');
  }
  if (!SUPPORTED_VOICE_PROVIDERS.includes(voiceProvider)) {
    throw new Error(`Unknown voice provider: ${voiceProvider}`);
  }

  try {
    // All tiers run on platform keys (config/freeTierApiKeys)
    const { apiKeys } = await getUserTierAndApiKeys(session.user.email);
    const apiKey = apiKeys[VOICE_PROVIDER_API_KEY[voiceProvider]];
    if (!apiKey) {
      // A missing platform key is our misconfiguration, not the user's
      console.error(`TTS: platform ${voiceProvider} API key is missing (user ${session.user.email})`);
      throw new Error('Voice generation is temporarily unavailable. Please try again later.');
    }

    const gameTier = await getGameTier(options.gameId);
    if (gameTier === USER_TIERS.FREE) {
      await assertFreeTierSpendWithinLimit(session.user.email);
    }

    const agent = createVoiceAgent(voiceProvider, apiKey);
    const { audio, costUSD } = await agent.speak({
      text,
      voice: options.voice,
      // A legacy long instruction wins over the short style; each agent turns
      // either into its provider's form of direction.
      voiceStyle: options.voiceInstructions || options.voiceStyle,
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

    return audio;
  } catch (error) {
    console.error('TTS Error:', error);
    if (error instanceof Error) {
      throw new Error(`Failed to generate speech: ${error.message}`);
    }
    throw new Error('Failed to generate speech: Unknown error');
  }
}
