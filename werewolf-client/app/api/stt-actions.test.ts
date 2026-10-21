/**
 * Unit tests for the STT server action (no real APIs): the platform key per
 * provider, the free-tier spend guard, billing through recordSpend, and the
 * feature-use row written for every dictated message.
 */
import { API_KEY_CONSTANTS } from "@/app/ai/ai-models";
import { USER_TIERS } from "@/app/api/game-models";

jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("@/app/utils/tier-utils", () => ({ getUserTierAndApiKeys: jest.fn() }));
jest.mock("@hiper2d/ai-agents", () => ({
  ...jest.requireActual("@hiper2d/ai-agents"),
  createVoiceAgent: jest.fn(),
}));
jest.mock("@/app/api/user-actions", () => ({
  assertFreeSpendWithinLimit: jest.fn(),
}));
jest.mock("@/app/utils/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), flush: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock("@/app/api/cost-tracking", () => ({
  ...jest.requireActual("@/app/api/cost-tracking"),
  recordSpend: jest.fn(),
}));
jest.mock("next/server", () => ({ after: (fn: () => void) => fn() }));
jest.mock("@/app/api/feature-events", () => ({ recordFeatureEvent: jest.fn().mockResolvedValue(undefined) }));

import { auth } from "@/auth";
import { getUserTierAndApiKeys } from "@/app/utils/tier-utils";
import { createVoiceAgent, VOICE_MODEL_CONSTANTS } from "@hiper2d/ai-agents";
import { recordSpend } from "@/app/api/cost-tracking";
import { recordFeatureEvent } from "@/app/api/feature-events";
import { transcribeAudio, transcribeAudioAction } from "@/app/api/stt-actions";

const USER_EMAIL = 'player@example.com';
const AUDIO = new ArrayBuffer(1024);
const TRANSCRIPT = 'I think the baker is lying.';
const COST = 0.0012;

const mockAuth = auth as jest.Mock;
const mockTierKeys = getUserTierAndApiKeys as jest.Mock;
const mockCreateAgent = createVoiceAgent as jest.Mock;
const mockRecordSpend = recordSpend as jest.Mock;
const transcribe = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  mockAuth.mockResolvedValue({ user: { email: USER_EMAIL } });
  mockCreateAgent.mockImplementation((provider: string) => ({
    provider,
    transcribe: transcribe.mockResolvedValue({ text: TRANSCRIPT, costUSD: COST, usage: {} }),
  }));
  mockRecordSpend.mockResolvedValue(undefined);
  mockTierKeys.mockResolvedValue({ tier: USER_TIERS.FREE, apiKeys: { [API_KEY_CONSTANTS.OPENAI]: 'platform-openai-key' } });
});

describe('transcribeAudio', () => {
  it('bills the reported cost as stt to the game and records a voice_stt row', async () => {
    const text = await transcribeAudio(AUDIO, { gameId: 'game-1', voiceProvider: 'openai' });

    expect(text).toBe(TRANSCRIPT);
    expect(mockCreateAgent).toHaveBeenCalledWith('openai', 'platform-openai-key');
    expect(mockRecordSpend).toHaveBeenCalledWith(expect.objectContaining({
      userEmail: USER_EMAIL, costUSD: COST, kind: 'stt', modelId: VOICE_MODEL_CONSTANTS.OPENAI_STT, gameId: 'game-1',
    }));
    expect(recordFeatureEvent).toHaveBeenCalledWith({
      userId: USER_EMAIL,
      feature: 'voice_stt',
      gameId: 'game-1',
      detail: { provider: 'openai', chars: TRANSCRIPT.length, audioBytes: AUDIO.byteLength },
    });
  });

  it('records nothing when the transcription failed', async () => {
    transcribe.mockRejectedValueOnce(new Error('provider down'));

    await expect(transcribeAudio(AUDIO, { voiceProvider: 'openai' })).rejects.toThrow('provider down');
    expect(recordFeatureEvent).not.toHaveBeenCalled();
    expect(mockRecordSpend).not.toHaveBeenCalled();
  });

  it('refuses an empty recording before touching keys', async () => {
    await expect(transcribeAudio(new ArrayBuffer(0))).rejects.toThrow('Audio data cannot be empty');
    expect(mockTierKeys).not.toHaveBeenCalled();
  });
});

describe('transcribeAudioAction', () => {
  it('carries the failure back as a value', async () => {
    transcribe.mockRejectedValueOnce(new Error('provider down'));
    const result = await transcribeAudioAction(AUDIO, { voiceProvider: 'openai' });
    expect(result).toEqual({ ok: false, error: expect.stringContaining('provider down') });
  });

  it('returns the text on success', async () => {
    const result = await transcribeAudioAction(AUDIO, { voiceProvider: 'openai' });
    expect(result).toEqual({ ok: true, text: TRANSCRIPT });
  });
});
