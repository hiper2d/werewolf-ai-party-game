/**
 * Unit tests for the TTS server-action tier wiring (no real APIs):
 * key resolution must be tier-aware (the prod bug: free/paid users got
 * "add your OpenAI API key in your profile" because personal keys were used).
 */
import { API_KEY_CONSTANTS } from "@/app/ai/ai-models";
import { USER_TIERS } from "@/app/api/game-models";
import { PAID_TIER_MARKUP } from "@/app/config/credit-packages";
import { calculateOpenAITtsCost } from "@/app/utils/pricing";

jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("@/app/utils/tier-utils", () => ({ getUserTierAndApiKeys: jest.fn() }));
jest.mock("@/app/ai/tts/openai-tts", () => ({ generateOpenAiTtsAudio: jest.fn() }));
jest.mock("@/app/ai/tts/google-tts", () => ({ generateGoogleTtsAudio: jest.fn() }));
jest.mock("@/app/api/user-actions", () => ({
  updateUserMonthlySpending: jest.fn(),
  deductBalance: jest.fn(),
}));
jest.mock("@/app/api/cost-tracking", () => ({
  recordGameCost: jest.fn(),
  getGameTier: jest.fn(),
}));

import { auth } from "@/auth";
import { getUserTierAndApiKeys } from "@/app/utils/tier-utils";
import { generateOpenAiTtsAudio } from "@/app/ai/tts/openai-tts";
import { generateGoogleTtsAudio } from "@/app/ai/tts/google-tts";
import { updateUserMonthlySpending, deductBalance } from "@/app/api/user-actions";
import { recordGameCost, getGameTier } from "@/app/api/cost-tracking";
import { generateSpeech } from "@/app/api/tts-actions";
import { generateGoogleSpeech } from "@/app/api/google-tts-actions";

const USER_EMAIL = 'player@example.com';
const TEXT = 'The night falls over the village.';
const FAKE_AUDIO = new ArrayBuffer(8);

const mockAuth = auth as jest.Mock;
const mockTierKeys = getUserTierAndApiKeys as jest.Mock;
const mockOpenAiTts = generateOpenAiTtsAudio as jest.Mock;
const mockGoogleTts = generateGoogleTtsAudio as jest.Mock;
const mockGetGameTier = getGameTier as jest.Mock;
const mockDeductBalance = deductBalance as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue({ user: { email: USER_EMAIL } });
  mockOpenAiTts.mockResolvedValue(FAKE_AUDIO);
  mockGoogleTts.mockResolvedValue(FAKE_AUDIO);
  mockGetGameTier.mockResolvedValue(USER_TIERS.FREE);
  mockDeductBalance.mockResolvedValue(true);
});

describe('generateSpeech tier-aware key resolution', () => {
  it('free tier: uses the platform key from tier-aware resolution', async () => {
    mockTierKeys.mockResolvedValue({
      tier: USER_TIERS.FREE,
      apiKeys: { [API_KEY_CONSTANTS.OPENAI]: 'platform-openai-key' },
    });

    const audio = await generateSpeech(TEXT, { gameId: 'game-1' });

    expect(audio).toBe(FAKE_AUDIO);
    expect(mockTierKeys).toHaveBeenCalledWith(USER_EMAIL);
    expect(mockOpenAiTts).toHaveBeenCalledWith(TEXT, 'platform-openai-key', expect.any(Object));
    expect(updateUserMonthlySpending).toHaveBeenCalledWith(
      USER_EMAIL, calculateOpenAITtsCost(TEXT.length), USER_TIERS.FREE
    );
    expect(recordGameCost).toHaveBeenCalledWith('game-1', calculateOpenAITtsCost(TEXT.length));
  });

  it('api tier without a personal key: tells the user to add a key in their profile', async () => {
    mockTierKeys.mockResolvedValue({ tier: USER_TIERS.API, apiKeys: {} });

    await expect(generateSpeech(TEXT)).rejects.toThrow(
      'Please add your OpenAI API key in your profile'
    );
    expect(mockOpenAiTts).not.toHaveBeenCalled();
  });

  it('free tier with a missing platform key: generic message, no profile advice', async () => {
    mockTierKeys.mockResolvedValue({ tier: USER_TIERS.FREE, apiKeys: {} });

    const error = await generateSpeech(TEXT).catch(e => e);
    expect(error.message).toContain('Voice generation is temporarily unavailable');
    expect(error.message).not.toContain('profile');
  });

  it('paid game: deducts balance with markup before recording spending', async () => {
    mockTierKeys.mockResolvedValue({
      tier: USER_TIERS.PAID,
      apiKeys: { [API_KEY_CONSTANTS.OPENAI]: 'platform-openai-key' },
    });
    mockGetGameTier.mockResolvedValue(USER_TIERS.PAID);

    await generateSpeech(TEXT, { gameId: 'game-1' });

    const cost = calculateOpenAITtsCost(TEXT.length);
    const charged = parseFloat((cost * (1 + PAID_TIER_MARKUP)).toFixed(6));
    expect(mockDeductBalance).toHaveBeenCalledWith(USER_EMAIL, charged);
    expect(updateUserMonthlySpending).toHaveBeenCalledWith(USER_EMAIL, cost, USER_TIERS.PAID);
  });

  it('paid game with insufficient balance: asks the user to add funds', async () => {
    mockTierKeys.mockResolvedValue({
      tier: USER_TIERS.PAID,
      apiKeys: { [API_KEY_CONSTANTS.OPENAI]: 'platform-openai-key' },
    });
    mockGetGameTier.mockResolvedValue(USER_TIERS.PAID);
    mockDeductBalance.mockResolvedValue(false);

    await expect(generateSpeech(TEXT)).rejects.toThrow('Insufficient balance');
    expect(updateUserMonthlySpending).not.toHaveBeenCalled();
  });
});

describe('generateGoogleSpeech tier-aware key resolution', () => {
  it('free tier: uses the platform Google key', async () => {
    mockTierKeys.mockResolvedValue({
      tier: USER_TIERS.FREE,
      apiKeys: { [API_KEY_CONSTANTS.GOOGLE]: 'platform-google-key' },
    });

    const audio = await generateGoogleSpeech(TEXT, { voiceName: 'Kore' });

    expect(audio).toBe(FAKE_AUDIO);
    expect(mockGoogleTts).toHaveBeenCalledWith(TEXT, 'platform-google-key', {
      voiceName: 'Kore',
      voiceStyle: undefined,
    });
  });

  it('api tier without a personal key: tells the user to add a key in their profile', async () => {
    mockTierKeys.mockResolvedValue({ tier: USER_TIERS.API, apiKeys: {} });

    await expect(generateGoogleSpeech(TEXT, { voiceName: 'Kore' })).rejects.toThrow(
      'Please add your Google API key in your profile'
    );
  });

  it('free tier with a missing platform key: generic message, no profile advice', async () => {
    mockTierKeys.mockResolvedValue({ tier: USER_TIERS.FREE, apiKeys: {} });

    const error = await generateGoogleSpeech(TEXT, { voiceName: 'Kore' }).catch(e => e);
    expect(error.message).toContain('Voice generation is temporarily unavailable');
    expect(error.message).not.toContain('profile');
  });
});
