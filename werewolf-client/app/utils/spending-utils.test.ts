import { applyDailySpend, freeSpendVerdicts, getFreeDailySpend, formatPeriod } from './spending-utils';

// 2026-09-11T15:30Z
const T = Date.UTC(2026, 8, 11, 15, 30, 0);
const LIMITS = { gamesPerDay: 5, dailySpendUSD: 5, monthlySpendUSD: 20 };

describe('formatPeriod', () => {
    it('is the UTC YYYY-MM key', () => {
        expect(formatPeriod(T)).toBe('2026-09');
        expect(formatPeriod(Date.UTC(2026, 0, 31, 23, 59, 59))).toBe('2026-01');
    });
});

describe('applyDailySpend', () => {
    it('starts today\'s ledger with the tier bucket and a zero hit counter', () => {
        expect(applyDailySpend(undefined, T, 0.25, 'free'))
            .toEqual({ period: '2026-09-11', totalUSD: 0.25, buckets: { free: 0.25 }, limitHits: 0 });
    });

    it('accumulates within the day and keeps the hit counter', () => {
        const a = { period: '2026-09-11', totalUSD: 1, buckets: { free: 1 }, limitHits: 2 };
        expect(applyDailySpend(a, T, 0.5, 'paid'))
            .toEqual({ period: '2026-09-11', totalUSD: 1.5, buckets: { free: 1, paid: 0.5 }, limitHits: 2 });
    });

    it('overwrites a stale day, resetting the hit counter', () => {
        const yesterday = { period: '2026-09-10', totalUSD: 5, buckets: { free: 5 }, limitHits: 7 };
        expect(applyDailySpend(yesterday, T, 0.1, 'free'))
            .toEqual({ period: '2026-09-11', totalUSD: 0.1, buckets: { free: 0.1 }, limitHits: 0 });
    });

    it('a zero amount normalizes to today without recording (used to place a limit hit)', () => {
        const yesterday = { period: '2026-09-10', totalUSD: 5, buckets: { free: 5 }, limitHits: 7 };
        expect(applyDailySpend(yesterday, T, 0, 'free'))
            .toEqual({ period: '2026-09-11', totalUSD: 0, buckets: {}, limitHits: 0 });
        const today = { period: '2026-09-11', totalUSD: 1, buckets: { free: 1 }, limitHits: 3 };
        expect(applyDailySpend(today, T, 0, 'free')).toEqual({ ...today });
    });

    it('tolerates a legacy ledger without limitHits', () => {
        const today = { period: '2026-09-11', totalUSD: 1, buckets: { free: 1 } } as any;
        expect(applyDailySpend(today, T, 1, 'free').limitHits).toBe(0);
    });
});

describe('getFreeDailySpend', () => {
    it('reads only the free bucket for today', () => {
        expect(getFreeDailySpend({ period: '2026-09-11', totalUSD: 3, buckets: { free: 1, paid: 2 } }, T)).toBe(1);
        expect(getFreeDailySpend({ period: '2026-09-10', totalUSD: 3, buckets: { free: 3 } }, T)).toBe(0);
        expect(getFreeDailySpend(undefined, T)).toBe(0);
    });
});

describe('freeSpendVerdicts', () => {
    it('returns the day verdict then the month verdict, judged on free spend only', () => {
        const [day, month] = freeSpendVerdicts({
            dailySpend: { period: '2026-09-11', totalUSD: 4, buckets: { free: 3, paid: 1 } },
            spendings: [{ period: '2026-09', amountUSD: 25, freeAmountUSD: 15, paidAmountUSD: 10 }],
        }, LIMITS, T);
        expect(day).toEqual(expect.objectContaining({ allowed: true, window: 'day', spentUSD: 3, remainingUSD: 2, limitUSD: 5, resetsAt: Date.UTC(2026, 8, 12) }));
        expect(month).toEqual(expect.objectContaining({ allowed: true, window: 'month', spentUSD: 15, remainingUSD: 5, limitUSD: 20, resetsAt: Date.UTC(2026, 9, 1) }));
    });

    it('refuses at exactly the cap', () => {
        const [day, month] = freeSpendVerdicts({
            dailySpend: { period: '2026-09-11', totalUSD: 5, buckets: { free: 5 } },
            spendings: [{ period: '2026-09', amountUSD: 20, freeAmountUSD: 20 }],
        }, LIMITS, T);
        expect(day.allowed).toBe(false);
        expect(month.allowed).toBe(false);
    });

    it('an empty or missing user reads as nothing spent', () => {
        expect(freeSpendVerdicts(undefined, LIMITS, T).every(v => v.allowed && v.spentUSD === 0)).toBe(true);
        expect(freeSpendVerdicts({}, LIMITS, T).every(v => v.allowed)).toBe(true);
    });
});
