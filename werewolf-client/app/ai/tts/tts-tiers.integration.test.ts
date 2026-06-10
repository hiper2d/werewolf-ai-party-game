/**
 * Real-API integration tests for the voice (TTS/STT) cores — the voice
 * equivalent of the agent tests. Costs a fraction of a cent per run.
 *
 * Covers both key sources the game uses (see app/utils/tier-utils.ts):
 *  - 'api' tier  → personal keys (OPENAI_K / GOOGLE_K from .env)
 *  - 'free'/'paid' tiers → platform keys from Firestore config/freeTierApiKeys,
 *    read with the same Firebase Admin credentials prod uses
 */
import { generateOpenAiTtsAudio } from "./openai-tts";
import { generateGoogleTtsAudio } from "./google-tts";
import { transcribeWithOpenAi } from "./openai-stt";
import { getFreeTierApiKeys } from "@/app/api/free-tier-actions";
import { API_KEY_CONSTANTS } from "@/app/ai/ai-models";

const SAMPLE_TEXT = "The werewolf hides among the villagers.";

function expectWavAudio(audio: ArrayBuffer) {
  expect(audio.byteLength).toBeGreaterThan(1000);
  const header = Buffer.from(audio.slice(0, 4)).toString('ascii');
  expect(header).toBe('RIFF');
}

describe("Voice with personal keys (api tier path)", () => {
  it("OpenAI TTS generates playable WAV audio", async () => {
    const audio = await generateOpenAiTtsAudio(SAMPLE_TEXT, process.env.OPENAI_K!);
    expectWavAudio(audio);
  });

  it("Google TTS generates playable WAV audio", async () => {
    const audio = await generateGoogleTtsAudio(SAMPLE_TEXT, process.env.GOOGLE_K!, {
      voiceName: 'Kore',
    });
    expectWavAudio(audio);
  });

  it("TTS → STT roundtrip returns the spoken text", async () => {
    const audio = await generateOpenAiTtsAudio(SAMPLE_TEXT, process.env.OPENAI_K!);
    const { text, durationSeconds } = await transcribeWithOpenAi(audio, process.env.OPENAI_K!, {
      fileName: 'audio.wav',
      mimeType: 'audio/wav',
    });
    expect(text.toLowerCase()).toContain('werewolf');
    expect(durationSeconds).toBeGreaterThan(0);
  });
});

describe("Voice with platform keys (free/paid tier path)", () => {
  it("platform key store has both voice provider keys", async () => {
    const keys = await getFreeTierApiKeys();
    expect(keys[API_KEY_CONSTANTS.OPENAI]).toBeTruthy();
    expect(keys[API_KEY_CONSTANTS.GOOGLE]).toBeTruthy();
  });

  it("OpenAI TTS works with the platform key (incl. TTS model access)", async () => {
    const keys = await getFreeTierApiKeys();
    const audio = await generateOpenAiTtsAudio(SAMPLE_TEXT, keys[API_KEY_CONSTANTS.OPENAI]);
    expectWavAudio(audio);
  });

  it("Google TTS works with the platform key (incl. TTS model access)", async () => {
    const keys = await getFreeTierApiKeys();
    const audio = await generateGoogleTtsAudio(SAMPLE_TEXT, keys[API_KEY_CONSTANTS.GOOGLE], {
      voiceName: 'Kore',
    });
    expectWavAudio(audio);
  });
});
