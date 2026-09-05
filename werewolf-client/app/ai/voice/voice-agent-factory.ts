import { API_KEY_CONSTANTS } from "@/app/ai/ai-models";
import { VoiceProvider } from "@/app/ai/voice-config";
import { VoiceAgent } from "./voice-agent";
import { OpenAiVoiceAgent } from "./openai-voice-agent";
import { GoogleVoiceAgent } from "./google-voice-agent";

/** Which platform key a voice provider runs on. */
export const VOICE_PROVIDER_API_KEY: Record<VoiceProvider, string> = {
  openai: API_KEY_CONSTANTS.OPENAI,
  google: API_KEY_CONSTANTS.GOOGLE,
};

/**
 * The voice counterpart of AgentFactory.createAgent: provider in, agent out.
 * Callers resolve the key first (so a missing platform key can be reported
 * as our misconfiguration before any SDK is touched).
 */
export function createVoiceAgent(provider: VoiceProvider, apiKey: string): VoiceAgent {
  switch (provider) {
    case 'openai':
      return new OpenAiVoiceAgent(apiKey);
    case 'google':
      return new GoogleVoiceAgent(apiKey);
    default:
      throw new Error(`Unknown voice provider: ${provider}`);
  }
}
