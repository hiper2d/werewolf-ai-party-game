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
 * Get the default voice provider.
 * Returns 'openai' as the default since it was the original provider.
 */
export function getDefaultVoiceProvider(): VoiceProvider {
  return 'openai';
}

/**
 * List of all supported voice providers.
 */
export const SUPPORTED_VOICE_PROVIDERS: VoiceProvider[] = ['openai', 'google'];

/**
 * Display names for voice providers (for UI).
 */
export const VOICE_PROVIDER_DISPLAY_NAMES: Record<VoiceProvider, string> = {
  openai: 'OpenAI',
  google: 'Google',
};

/**
 * Descriptions for voice providers (for UI).
 */
export const VOICE_PROVIDER_DESCRIPTIONS: Record<VoiceProvider, string> = {
  openai: '10 voices with detailed voice instruction support. Best for nuanced character voices.',
  google: '30 prebuilt voices with distinct personalities. Best for variety and natural speech.',
};
