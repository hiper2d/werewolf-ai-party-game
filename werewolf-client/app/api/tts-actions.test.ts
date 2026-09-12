/**
 * Unit tests for the TTS server-action tier wiring (no real APIs): the voice
 * agent comes from the library factory (mocked here); this action resolves the
 * platform key per provider, runs the free-tier spend guard, and bills the cost
 * the agent reports through the one chokepoint (recordSpend). The prod bug this
 * pins: free/paid users once got "add your OpenAI API key in your profile"
 * because personal keys were used.
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
jest.mock("@/app/api/cost-tracking", () => ({
  ...jest.requireActual("@/app/api/cost-tracking"),
  recordSpend: jest.fn(),
}));

import { auth } from "@/auth";
import { getUserTierAndApiKeys } from "@/app/utils/tier-utils";
import { createVoiceAgent, VOICE_MODEL_CONSTANTS } from "@hiper2d/ai-agents";
import { assertFreeSpendWithinLimit } from "@/app/api/user-actions";
import { recordSpend } from "@/app/api/cost-tracking";
import { generateSpeechWithProvider } from "@/app/api/tts-actions";

const USER_EMAIL = 'player@example.com';
const TEXT = 'The night falls over the village.';
const FAKE_AUDIO = new ArrayBuffer(8);
const OPENAI_COST = 0.000495;   // what the agent reports; the action must bill exactly this
const GOOGLE_COST = 0.00572;

const mockAuth = auth as jest.Mock;
const mockTierKeys = getUserTierAndApiKeys as jest.Mock;
const mockCreateAgent = createVoiceAgent as jest.Mock;
const mockAssertFreeSpend = assertFreeSpendWithinLimit as jest.Mock;
const mockRecordSpend = recordSpend as jest.Mock;
const speak = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  mockAuth.mockResolvedValue({ user: { email: USER_EMAIL } });
  mockCreateAgent.mockImplementation((provider: string) => ({
    provider,
    speak: speak.mockResolvedValue({
      audio: FAKE_AUDIO,
      costUSD: provider === 'openai' ? OPENAI_COST : GOOGLE_COST,
      usage: {},
    }),
  }));
  mockAssertFreeSpend.mockResolvedValue(undefined);
  mockRecordSpend.mockResolvedValue(undefined);
});

const openaiKeys = (tier: string) => ({ tier, apiKeys: { [API_KEY_CONSTANTS.OPENAI]: 'platform-openai-key' } });

describe('generateSpeechWithProvider: key resolution', () => {
  it('free tier: builds the OpenAI agent with the platform key and bills the reported cost to the game', async () => {
    mockTierKeys.mockResolvedValue(openaiKeys(USER_TIERS.FREE));

    const audio = await generateSpeechWithProvider(TEXT, { voice: 'onyx', voiceStyle: 'gravely', gameId: 'game-1' }, 'openai');

    expect(audio).toBe(FAKE_AUDIO);
    expect(mockTierKeys).toHaveBeenCalledWith(USER_EMAIL);
    expect(mockCreateAgent).toHaveBeenCalledWith('openai', 'platform-openai-key');
    expect(speak).toHaveBeenCalledWith({ text: TEXT, voice: 'onyx', voiceStyle: 'gravely' });
    expect(mockRecordSpend).toHaveBeenCalledTimes(1);
    const input = mockRecordSpend.mock.calls[0][0];
    expect(input).toEqual(expect.objectContaining({
      userEmail: USER_EMAIL,
      costUSD: OPENAI_COST,
      kind: 'tts',
      modelId: VOICE_MODEL_CONSTANTS.OPENAI_TTS,
      apiKeyName: API_KEY_CONSTANTS.OPENAI,
      gameId: 'game-1',
    }));
    // The game's running total moves in the same transaction.
    expect(input.gameUpdate({ totalGameCost: 1 })).toEqual({ totalGameCost: parseFloat((1 + OPENAI_COST).toFixed(6)) });
  });

  it('google provider: resolves the Google platform key and names the Gemini TTS model', async () => {
    mockTierKeys.mockResolvedValue({ tier: USER_TIERS.FREE, apiKeys: { [API_KEY_CONSTANTS.GOOGLE]: 'platform-google-key' } });

    await generateSpeechWithProvider(TEXT, { voice: 'Kore' }, 'google');

    expect(mockCreateAgent).toHaveBeenCalledWith('google', 'platform-google-key');
    expect(mockRecordSpend).toHaveBeenCalledWith(expect.objectContaining({
      costUSD: GOOGLE_COST, kind: 'tts', modelId: VOICE_MODEL_CONSTANTS.GOOGLE_TTS, apiKeyName: API_KEY_CONSTANTS.GOOGLE, gameId: undefined, gameUpdate: undefined,
    }));
  });

  it('a legacy long instruction wins over the short style', async () => {
    mockTierKeys.mockResolvedValue(openaiKeys(USER_TIERS.FREE));
    await generateSpeechWithProvider(TEXT, { voice: 'onyx', voiceStyle: 'gravely', voiceInstructions: 'Speak like an old sailor.' }, 'openai');
    expect(speak).toHaveBeenCalledWith(expect.objectContaining({ voiceStyle: 'Speak like an old sailor.' }));
  });

  it('missing platform key for the provider: generic message, no profile advice, no agent built', async () => {
    mockTierKeys.mockResolvedValue({ tier: USER_TIERS.FREE, apiKeys: { [API_KEY_CONSTANTS.OPENAI]: 'k' } });

    const error = await generateSpeechWithProvider(TEXT, { voice: 'Kore' }, 'google').catch(e => e);
    expect(error.message).toContain('Voice generation is temporarily unavailable');
    expect(error.message).not.toContain('profile');
    expect(mockCreateAgent).not.toHaveBeenCalled();
  });

  it('rejects an unknown provider before touching keys', async () => {
    await expect(generateSpeechWithProvider(TEXT, { voice: 'x' }, 'azure' as any)).rejects.toThrow('Unknown voice provider');
    expect(mockTierKeys).not.toHaveBeenCalled();
  });
});

describe('generateSpeechWithProvider: spend guard and billing', () => {
  it('runs the spend guard on the user (not the game) before generating, for every tier', async () => {
    mockTierKeys.mockResolvedValue(openaiKeys(USER_TIERS.PAID));

    await generateSpeechWithProvider(TEXT, { voice: 'onyx', gameId: 'game-1' }, 'openai');

    expect(mockAssertFreeSpend).toHaveBeenCalledWith(USER_EMAIL);
    expect(mockAssertFreeSpend.mock.invocationCallOrder[0]).toBeLessThan(speak.mock.invocationCallOrder[0]);
  });

  it('paid user with an insufficient balance: the chokepoint refuses and the user is asked to add funds', async () => {
    mockTierKeys.mockResolvedValue(openaiKeys(USER_TIERS.PAID));
    mockRecordSpend.mockRejectedValue(new Error('Insufficient balance. Please add funds on your profile page to continue playing.'));

    await expect(generateSpeechWithProvider(TEXT, { voice: 'onyx' }, 'openai')).rejects.toThrow('Insufficient balance');
  });

  it('free user at the daily cap: refused before any audio is generated or billed', async () => {
    mockTierKeys.mockResolvedValue(openaiKeys(USER_TIERS.FREE));
    mockAssertFreeSpend.mockRejectedValue(new Error("You've used today's free $5 of AI. Come back after midnight UTC, or add funds on your profile page to keep playing now."));

    await expect(generateSpeechWithProvider(TEXT, { voice: 'onyx', gameId: 'game-1' }, 'openai')).rejects.toThrow(/today's free \$5 of AI/);
    expect(speak).not.toHaveBeenCalled();
    expect(mockRecordSpend).not.toHaveBeenCalled();
  });

  it('zero-cost results are not billed', async () => {
    mockTierKeys.mockResolvedValue(openaiKeys(USER_TIERS.FREE));
    mockCreateAgent.mockImplementation(() => ({ speak: jest.fn().mockResolvedValue({ audio: FAKE_AUDIO, costUSD: 0, usage: {} }) }));

    await generateSpeechWithProvider(TEXT, { voice: 'onyx' }, 'openai');

    expect(mockRecordSpend).not.toHaveBeenCalled();
  });
});
