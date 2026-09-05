/**
 * Real-API check that the PLATFORM keys (Firestore config/freeTierApiKeys, the
 * keys every tier runs on) work with the library's voice agents for both
 * providers — speech and transcription. The provider contracts themselves are
 * tested in the ai-agents repo; this pins our key store + model access.
 * Costs a fraction of a cent per run.
 */
import { VoiceAgentFactory, SUPPORTED_VOICE_PROVIDERS } from "@hiper2d/ai-agents";
import { getFreeTierApiKeys } from "@/app/api/free-tier-actions";
import { API_KEY_CONSTANTS } from "@/app/ai/ai-models";

const SAMPLE_TEXT = "The werewolf hides among the villagers.";
const SAMPLE_VOICE = { openai: 'onyx', google: 'Kore' } as const;

describe("Voice with platform keys (free/paid tier path)", () => {
  it("platform key store has both voice provider keys", async () => {
    const keys = await getFreeTierApiKeys();
    expect(keys[API_KEY_CONSTANTS.OPENAI]).toBeTruthy();
    expect(keys[API_KEY_CONSTANTS.GOOGLE]).toBeTruthy();
  });

  for (const provider of SUPPORTED_VOICE_PROVIDERS) {
    it(`${provider}: platform key speaks and transcribes (incl. model access)`, async () => {
      const agent = VoiceAgentFactory.createAgentFromKeys(provider, await getFreeTierApiKeys());
      const { audio, costUSD } = await agent.speak({ text: SAMPLE_TEXT, voice: SAMPLE_VOICE[provider], voiceStyle: 'mysteriously' });
      expect(audio.byteLength).toBeGreaterThan(1000);
      expect(Buffer.from(audio.slice(0, 4)).toString('ascii')).toBe('RIFF');
      expect(costUSD).toBeGreaterThan(0);

      const { text } = await agent.transcribe({ audio, mimeType: 'audio/wav', fileName: 'audio.wav' });
      expect(text.toLowerCase()).toContain('werewolf');
    });
  }
});
