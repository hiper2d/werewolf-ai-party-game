/**
 * Voice Configuration System
 *
 * Provides an abstraction layer for voice metadata and configuration
 * that can be extended to support multiple TTS providers.
 */

import type { VoiceProvider } from '@hiper2d/ai-agents';

// The provider id is the library's (it names the VoiceAgentFactory agent); the
// voice lists below are this app's own casting metadata.
export type { VoiceProvider };

export interface VoiceMetadata {
  /** Voice identifier (e.g., "echo", "Kore") */
  id: string;
  /** Voice gender */
  gender: 'male' | 'female';
  /** Detailed description to help the Game Master AI select appropriate voices */
  description: string;
  /** Similar-sounding celebrities (actors, singers) for reference */
  celebrityExamples: string[];
  /** A possible story or biography of a voice owner */
  biography?: string;
}

export interface VoiceConfig {
  /** The voice provider this config is for */
  provider: VoiceProvider;

  /** Get all available voices */
  getVoices(): VoiceMetadata[];

  /** Get voices filtered by gender */
  getVoicesByGender(gender: 'male' | 'female'): VoiceMetadata[];

  /** Get a specific voice by ID */
  getVoiceById(id: string): VoiceMetadata | undefined;

  /**
   * Generate a formatted description of all voices for use in AI prompts.
   * This helps the Game Master AI select appropriate voices for characters.
   */
  getPromptDescription(): string;
}
