'use server';

import { auth } from "@/auth";
import { getUserTierAndApiKeys } from "@/app/utils/tier-utils";
import { assertFreeSpendWithinLimit } from "@/app/api/user-actions";
import { incrementGameCost, recordSpend } from "@/app/api/cost-tracking";
import { getDefaultVoiceProvider, SUPPORTED_VOICE_PROVIDERS, VoiceProvider } from "@/app/ai/voice-config";
import { createVoiceAgent, VOICE_MODEL_CONSTANTS, VOICE_PROVIDER_API_KEY } from "@hiper2d/ai-agents";

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

    // Free-tier spend caps, on the user's CURRENT tier (paid users pass straight through).
    await assertFreeSpendWithinLimit(session.user.email);

    const agent = createVoiceAgent(voiceProvider, apiKey);
    const { text, costUSD } = await agent.transcribe({
      audio: audioBuffer,
      mimeType: options.mimeType,
      language: options.language,
      prompt: options.prompt,
    });

    if (costUSD > 0) {
      // One chokepoint: charges the current tier (paid: cost + markup, throwing on an
      // insufficient balance), moves both spend ledgers, writes the stats row, and adds
      // the cost to the game's total when the transcription belongs to a game.
      await recordSpend({
        userEmail: session.user.email,
        costUSD,
        kind: 'stt',
        modelId: voiceProvider === 'google' ? VOICE_MODEL_CONSTANTS.GOOGLE_STT : VOICE_MODEL_CONSTANTS.OPENAI_STT,
        apiKeyName: VOICE_PROVIDER_API_KEY[voiceProvider],
        gameId: options.gameId,
        gameUpdate: options.gameId ? incrementGameCost(costUSD) : undefined,
      });
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
