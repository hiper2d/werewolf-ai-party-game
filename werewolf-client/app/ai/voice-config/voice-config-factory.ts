import { VoiceConfig, VoiceProvider } from './voice-config';
import { OpenAIVoiceConfig } from './openai-voice-config';
import { GoogleVoiceConfig } from './google-voice-config';

/**
 * Factory function to get the appropriate voice configuration
 * based on the selected voice provider.
 *
 * @param provider - The voice provider to get configuration for
 * @returns The voice configuration for the specified provider
 * @throws Error if an unknown provider is specified
 */
export function getVoiceConfig(provider: VoiceProvider): VoiceConfig {
  switch (provider) {
    case 'openai':
      return new OpenAIVoiceConfig();
    case 'google':
      return new GoogleVoiceConfig();
    default:
      throw new Error(`Unknown voice provider: ${provider}`);
  }
}

/**
 * The voice set a new game is cast from when the player has no saved
 * preference. Gemini since 2026-10-21: about 4x cheaper and 2.5x faster than
 * OpenAI, and OpenAI's speech stream was being cut mid-line for about one call
 * in ten ("terminated") in the two voiced games of that week. OpenAI was the
 * default before only because it was the original provider.
 */
export function getDefaultVoiceProvider(): VoiceProvider {
  return 'google';
}

/**
 * The provider of a game doc that predates the `voiceProvider` field (before
 * 2026-09-05): those games were cast from OpenAI voice ids, so reading them
 * through the current default would pair Gemini with ids it does not have.
 * Only for reading stored games — never for a new choice.
 */
export const LEGACY_VOICE_PROVIDER: VoiceProvider = 'openai';

/** The providers the library's VoiceAgentFactory serves — the same list this app casts from. */
export { SUPPORTED_VOICE_PROVIDERS } from '@hiper2d/ai-agents';

/**
 * Display names for voice providers (for UI).
 */
export const VOICE_PROVIDER_DISPLAY_NAMES: Record<VoiceProvider, string> = {
  openai: 'OpenAI',
  google: 'Gemini',
};

/**
 * Descriptions for voice providers (for UI).
 */
export const VOICE_PROVIDER_DESCRIPTIONS: Record<VoiceProvider, string> = {
  openai: '10 voices that follow style instructions closely. The cheaper set.',
  google: '30 voices with more natural, expressive speech. Roughly 3-5x the OpenAI price per line.',
};

/** True when `voice` is a real voice id of `provider`. */
export function isVoiceOfProvider(provider: VoiceProvider, voice: string): boolean {
  return !!voice && !!getVoiceConfig(provider).getVoiceById(voice);
}
