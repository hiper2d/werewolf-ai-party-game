import { getFreeTierLimits, limitsFromConfig, resetFreeTierLimitsCache, DEFAULT_FREE_TIER_LIMITS } from './limits-actions';
import { db } from '@/firebase/server';

jest.mock('@/firebase/server', () => ({ db: { collection: jest.fn() } }));

function setupDoc(data: any | null, error?: Error) {
    const get = error
        ? jest.fn().mockRejectedValue(error)
        : jest.fn().mockResolvedValue({ exists: data !== null, data: () => data });
    (db!.collection as jest.Mock).mockReturnValue({ doc: jest.fn().mockReturnValue({ get }) });
    return get;
}

describe('limitsFromConfig', () => {
    it('overlays present fields on the defaults', () => {
        expect(limitsFromConfig({ freeDailySpendUSD: 2 })).toEqual({ ...DEFAULT_FREE_TIER_LIMITS, dailySpendUSD: 2 });
        expect(limitsFromConfig({ freeDailySpendUSD: 0, freeMonthlySpendUSD: 50, freeGamesPerDay: 3 }))
            .toEqual({ dailySpendUSD: 0, monthlySpendUSD: 50, gamesPerDay: 3 });
    });

    it('falls back per field on garbage', () => {
        expect(limitsFromConfig({ freeDailySpendUSD: 'lots', freeMonthlySpendUSD: -1, freeGamesPerDay: null }))
            .toEqual(DEFAULT_FREE_TIER_LIMITS);
        expect(limitsFromConfig(undefined)).toEqual(DEFAULT_FREE_TIER_LIMITS);
    });
});

describe('getFreeTierLimits', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        resetFreeTierLimitsCache();
        jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('reads config/limits once and serves the cached value afterwards', async () => {
        const get = setupDoc({ freeDailySpendUSD: 1 });
        await expect(getFreeTierLimits()).resolves.toEqual({ ...DEFAULT_FREE_TIER_LIMITS, dailySpendUSD: 1 });
        await expect(getFreeTierLimits()).resolves.toEqual({ ...DEFAULT_FREE_TIER_LIMITS, dailySpendUSD: 1 });
        expect(get).toHaveBeenCalledTimes(1);
    });

    it('a missing doc means the defaults', async () => {
        setupDoc(null);
        await expect(getFreeTierLimits()).resolves.toEqual(DEFAULT_FREE_TIER_LIMITS);
    });

    it('a read failure means the defaults, never an exception', async () => {
        setupDoc(null, new Error('firestore down'));
        await expect(getFreeTierLimits()).resolves.toEqual(DEFAULT_FREE_TIER_LIMITS);
    });
});
