// Voice Configuration System - Public API

export type { VoiceProvider, VoiceMetadata, VoiceConfig } from './voice-config';

export {
  getVoiceConfig,
  getDefaultVoiceProvider,
  SUPPORTED_VOICE_PROVIDERS,
  VOICE_PROVIDER_DISPLAY_NAMES,
  VOICE_PROVIDER_DESCRIPTIONS,
} from './voice-config-factory';

export { OpenAIVoiceConfig } from './openai-voice-config';
export { GoogleVoiceConfig } from './google-voice-config';
