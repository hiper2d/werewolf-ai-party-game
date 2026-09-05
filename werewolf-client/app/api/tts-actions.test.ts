/**
 * Unit tests for the TTS server-action tier wiring (no real APIs): the voice
 * agent comes from the library factory (mocked here); this action resolves the
 * platform key per provider, applies the tier guards, and bills the cost the
 * agent reports. The prod bug this pins: free/paid users once got "add your
 * OpenAI API key in your profile" because personal keys were used.
 */
import { API_KEY_CONSTANTS } from "@/app/ai/ai-models";
import { USER_TIERS } from "@/app/api/game-models";
import { PAID_TIER_MARKUP } from "@/app/config/credit-packages";

jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("@/app/utils/tier-utils", () => ({ getUserTierAndApiKeys: jest.fn() }));
jest.mock("@hiper2d/ai-agents", () => ({
  ...jest.requireActual("@hiper2d/ai-agents"),
  createVoiceAgent: jest.fn(),
}));
jest.mock("@/app/api/user-actions", () => ({
  updateUserMonthlySpending: jest.fn(),
  deductBalance: jest.fn(),
  assertFreeTierSpendWithinLimit: jest.fn(),
}));
jest.mock("@/app/api/cost-tracking", () => ({
  recordGameCost: jest.fn(),
  getGameTier: jest.fn(),
}));

import { auth } from "@/auth";
import { getUserTierAndApiKeys } from "@/app/utils/tier-utils";
import { createVoiceAgent } from "@hiper2d/ai-agents";
import { updateUserMonthlySpending, deductBalance, assertFreeTierSpendWithinLimit } from "@/app/api/user-actions";
import { recordGameCost, getGameTier } from "@/app/api/cost-tracking";
import { generateSpeechWithProvider } from "@/app/api/tts-actions";

const USER_EMAIL = 'player@example.com';
const TEXT = 'The night falls over the village.';
const FAKE_AUDIO = new ArrayBuffer(8);
const OPENAI_COST = 0.000495;   // what the agent reports; the action must bill exactly this
const GOOGLE_COST = 0.00572;

const mockAuth = auth as jest.Mock;
const mockTierKeys = getUserTierAndApiKeys as jest.Mock;
const mockCreateAgent = createVoiceAgent as jest.Mock;
const mockGetGameTier = getGameTier as jest.Mock;
const mockDeductBalance = deductBalance as jest.Mock;
const mockAssertFreeTierSpend = assertFreeTierSpendWithinLimit as jest.Mock;
const speak = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue({ user: { email: USER_EMAIL } });
  mockCreateAgent.mockImplementation((provider: string) => ({
    provider,
    speak: speak.mockResolvedValue({
      audio: FAKE_AUDIO,
      costUSD: provider === 'openai' ? OPENAI_COST : GOOGLE_COST,
      usage: {},
    }),
  }));
  mockGetGameTier.mockResolvedValue(USER_TIERS.FREE);
  mockDeductBalance.mockResolvedValue(true);
  mockAssertFreeTierSpend.mockResolvedValue(undefined);
});

const openaiKeys = (tier: string) => ({ tier, apiKeys: { [API_KEY_CONSTANTS.OPENAI]: 'platform-openai-key' } });

describe('generateSpeechWithProvider: key resolution', () => {
  it('free tier: builds the OpenAI agent with the platform key and bills the reported cost', async () => {
    mockTierKeys.mockResolvedValue(openaiKeys(USER_TIERS.FREE));

    const audio = await generateSpeechWithProvider(TEXT, { voice: 'onyx', voiceStyle: 'gravely', gameId: 'game-1' }, 'openai');

    expect(audio).toBe(FAKE_AUDIO);
    expect(mockTierKeys).toHaveBeenCalledWith(USER_EMAIL);
    expect(mockCreateAgent).toHaveBeenCalledWith('openai', 'platform-openai-key');
    expect(speak).toHaveBeenCalledWith({ text: TEXT, voice: 'onyx', voiceStyle: 'gravely' });
    expect(updateUserMonthlySpending).toHaveBeenCalledWith(USER_EMAIL, OPENAI_COST, USER_TIERS.FREE);
    expect(recordGameCost).toHaveBeenCalledWith('game-1', OPENAI_COST);
  });

  it('google provider: resolves the Google platform key', async () => {
    mockTierKeys.mockResolvedValue({ tier: USER_TIERS.FREE, apiKeys: { [API_KEY_CONSTANTS.GOOGLE]: 'platform-google-key' } });

    await generateSpeechWithProvider(TEXT, { voice: 'Kore' }, 'google');

    expect(mockCreateAgent).toHaveBeenCalledWith('google', 'platform-google-key');
    expect(updateUserMonthlySpending).toHaveBeenCalledWith(USER_EMAIL, GOOGLE_COST, USER_TIERS.FREE);
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

describe('generateSpeechWithProvider: tier billing', () => {
  it('paid game: deducts balance with markup before recording spending', async () => {
    mockTierKeys.mockResolvedValue(openaiKeys(USER_TIERS.PAID));
    mockGetGameTier.mockResolvedValue(USER_TIERS.PAID);

    await generateSpeechWithProvider(TEXT, { voice: 'onyx', gameId: 'game-1' }, 'openai');

    const charged = parseFloat((OPENAI_COST * (1 + PAID_TIER_MARKUP)).toFixed(6));
    expect(mockDeductBalance).toHaveBeenCalledWith(USER_EMAIL, charged);
    expect(updateUserMonthlySpending).toHaveBeenCalledWith(USER_EMAIL, OPENAI_COST, USER_TIERS.PAID);
    expect(mockAssertFreeTierSpend).not.toHaveBeenCalled();
  });

  it('paid game with insufficient balance: asks the user to add funds', async () => {
    mockTierKeys.mockResolvedValue(openaiKeys(USER_TIERS.PAID));
    mockGetGameTier.mockResolvedValue(USER_TIERS.PAID);
    mockDeductBalance.mockResolvedValue(false);

    await expect(generateSpeechWithProvider(TEXT, { voice: 'onyx' }, 'openai')).rejects.toThrow('Insufficient balance');
    expect(updateUserMonthlySpending).not.toHaveBeenCalled();
  });

  it('free game over the monthly spend cap: refuses before generating audio', async () => {
    mockTierKeys.mockResolvedValue(openaiKeys(USER_TIERS.FREE));
    mockAssertFreeTierSpend.mockRejectedValue(new Error('Monthly free-tier voice limit reached. Add funds on your profile page to keep using voice features.'));

    await expect(generateSpeechWithProvider(TEXT, { voice: 'onyx', gameId: 'game-1' }, 'openai')).rejects.toThrow('Monthly free-tier voice limit reached');
    expect(speak).not.toHaveBeenCalled();
    expect(updateUserMonthlySpending).not.toHaveBeenCalled();
  });
});
