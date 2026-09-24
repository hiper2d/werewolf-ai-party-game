'use server';

import { auth } from "@/auth";
import { getUserTierAndApiKeys } from "@/app/utils/tier-utils";
import { assertFreeSpendWithinLimit } from "@/app/api/user-actions";
import { incrementGameCost, recordSpend } from "@/app/api/cost-tracking";
import { SUPPORTED_VOICE_PROVIDERS, VoiceProvider } from "@/app/ai/voice-config";
import { createVoiceAgent, VOICE_MODEL_CONSTANTS, VOICE_PROVIDER_API_KEY } from "@hiper2d/ai-agents";
import { logger } from "@/app/utils/logger";

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

    // Free-tier spend caps, on the user's CURRENT tier (paid users pass straight through).
    await assertFreeSpendWithinLimit(session.user.email);

    const agent = createVoiceAgent(voiceProvider, apiKey);
    const voiceStyle = options.voiceInstructions || options.voiceStyle;
    const { audio, costUSD, styleDropped } = await agent.speak({
      text,
      voice: options.voice,
      // A legacy long instruction wins over the short style; each agent turns
      // either into its provider's form of direction.
      voiceStyle,
    });
    if (styleDropped) {
      // Gemini safety-blocked the styled line and the agent read it plain
      logger.warn(`TTS_STYLE_DROPPED: ${voiceProvider} blocked voice style "${voiceStyle}", read without it`, {
        voiceProvider,
        voice: options.voice,
        voiceStyle,
        gameId: options.gameId,
      });
    }

    if (costUSD > 0) {
      // One chokepoint: charges the current tier (paid: cost + markup, throwing on an
      // insufficient balance), moves both spend ledgers, writes the stats row, and adds
      // the cost to the game's total when the speech belongs to a game.
      await recordSpend({
        userEmail: session.user.email,
        costUSD,
        kind: 'tts',
        modelId: voiceProvider === 'google' ? VOICE_MODEL_CONSTANTS.GOOGLE_TTS : VOICE_MODEL_CONSTANTS.OPENAI_TTS,
        apiKeyName: VOICE_PROVIDER_API_KEY[voiceProvider],
        gameId: options.gameId,
        gameUpdate: options.gameId ? incrementGameCost(costUSD) : undefined,
      });
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

export type SpeechResult =
  | { ok: true; audio: ArrayBuffer }
  | { ok: false; error: string };

/**
 * The server action the client's tts-service calls. It carries a failure back as a
 * value: a production build strips the message off every error thrown from a server
 * action, so the player only saw "An error occurred in the Server Components render"
 * when a spoken line failed (2026-09-16), and nothing reached Better Stack because the
 * action only wrote to the console. generateSpeechWithProvider keeps throwing for
 * callers and tests that want the exception.
 *
 * The logger is flushed before returning: Vercel freezes the function the moment the
 * action settles, so the debounced flush never fires for the last lines.
 */
export async function generateSpeechAction(
  text: string,
  options: UnifiedTTSOptions,
  voiceProvider: VoiceProvider
): Promise<SpeechResult> {
  try {
    const audio = await generateSpeechWithProvider(text, options, voiceProvider);
    return { ok: true, audio };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Speech generation failed: ${message}`, {
      function: 'generateSpeechAction',
      voiceProvider,
      voice: options.voice,
      gameId: options.gameId,
      textLength: text.length,
      error: message,
      details: error instanceof Error ? error.stack : undefined,
    });
    return { ok: false, error: message };
  } finally {
    try {
      await logger.flush();
    } catch { /* logging must never fail playback */ }
  }
}
