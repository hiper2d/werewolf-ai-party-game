import { updateUserMonthlySpending, deductBalance, addBalance, assertFreeSpendWithinLimit } from './user-actions';
import { db } from "@/firebase/server";
import { UserMonthlySpending } from "@/app/api/game-models";
import { getFreeTierLimits } from "@/app/api/limits-actions";
import { FreeSpendLimitError } from "@/app/api/errors";

jest.mock('@/app/api/limits-actions', () => ({
    getFreeTierLimits: jest.fn(async () => ({ gamesPerDay: 5, dailySpendUSD: 5, monthlySpendUSD: 20 })),
}));

// Mock dependencies (same pattern as night-replay.test.ts)
jest.mock("@/firebase/server", () => ({
    db: {
        collection: jest.fn(),
        runTransaction: jest.fn()
    }
}));

type FakeTransaction = {
    get: jest.Mock;
    set: jest.Mock;
    update: jest.Mock;
};

/**
 * Wires db.collection('users').doc(id) to a stable ref and makes
 * db.runTransaction invoke its callback with a fake transaction whose
 * get() resolves to the provided user data (null = user doc missing).
 */
function setupTransaction(userData: any | null): { txn: FakeTransaction; userRef: any } {
    const userRef = { id: 'fake-user-ref' };

    const txn: FakeTransaction = {
        get: jest.fn().mockResolvedValue({
            exists: userData !== null,
            data: () => userData
        }),
        set: jest.fn(),
        update: jest.fn()
    };

    (db!.collection as jest.Mock).mockReturnValue({
        doc: jest.fn().mockReturnValue(userRef)
    });
    (db!.runTransaction as jest.Mock).mockImplementation(async (cb: any) => cb(txn));

    return { txn, userRef };
}

describe('updateUserMonthlySpending', () => {
    const userId = 'player@example.com';
    // 2026-06-10 12:00 UTC — period must be derived with UTC getters, so this is
    // deterministic regardless of the machine's local timezone.
    const JUNE_2026 = Date.UTC(2026, 5, 10, 12, 0, 0);

    beforeEach(() => {
        jest.clearAllMocks();
        jest.restoreAllMocks();
    });

    describe('input guards', () => {
        it('throws when userId is empty', async () => {
            setupTransaction({});
            await expect(updateUserMonthlySpending('', 1, 'free')).rejects.toThrow(/User ID is required/);
        });

        it('ignores zero amounts', async () => {
            setupTransaction({});
            await updateUserMonthlySpending(userId, 0, 'free', JUNE_2026);
            expect(db!.runTransaction).not.toHaveBeenCalled();
        });

        it('ignores negative amounts', async () => {
            setupTransaction({});
            await updateUserMonthlySpending(userId, -0.5, 'paid', JUNE_2026);
            expect(db!.runTransaction).not.toHaveBeenCalled();
        });

        it('ignores NaN / undefined amounts', async () => {
            setupTransaction({});
            await updateUserMonthlySpending(userId, NaN, 'free', JUNE_2026);
            await updateUserMonthlySpending(userId, undefined as any, 'free', JUNE_2026);
            expect(db!.runTransaction).not.toHaveBeenCalled();
        });

        it('ignores sub-microdollar amounts that round to zero at 6dp', async () => {
            setupTransaction({});
            await updateUserMonthlySpending(userId, 0.0000004, 'paid', JUNE_2026);
            expect(db!.runTransaction).not.toHaveBeenCalled();
        });
    });

    describe('monthly period key derivation (YYYY-MM, UTC)', () => {
        it('derives the period from the explicit timestamp', async () => {
            const { txn } = setupTransaction({ spendings: [] });

            await updateUserMonthlySpending(userId, 1, 'free', Date.UTC(2026, 0, 31, 23, 59, 59));

            const written = txn.update.mock.calls[0][1].spendings as UserMonthlySpending[];
            expect(written).toHaveLength(1);
            expect(written[0].period).toBe('2026-01');
        });

        it('zero-pads single-digit months', async () => {
            const { txn } = setupTransaction({ spendings: [] });

            await updateUserMonthlySpending(userId, 1, 'free', JUNE_2026);

            const written = txn.update.mock.calls[0][1].spendings as UserMonthlySpending[];
            expect(written[0].period).toBe('2026-06');
        });

        it('defaults the timestamp to Date.now()', async () => {
            const { txn } = setupTransaction({ spendings: [] });
            jest.spyOn(Date, 'now').mockReturnValue(Date.UTC(2025, 11, 15)); // Dec 2025

            await updateUserMonthlySpending(userId, 1, 'free');

            const written = txn.update.mock.calls[0][1].spendings as UserMonthlySpending[];
            expect(written[0].period).toBe('2025-12');
        });
    });

    describe('transaction read-modify-write', () => {
        it('aggregates into an existing record for the same period (total + tier bucket)', async () => {
            const { txn, userRef } = setupTransaction({
                spendings: [
                    { period: '2026-06', amountUSD: 1.5, freeAmountUSD: 1, apiAmountUSD: 0.5, paidAmountUSD: 0 }
                ]
            });

            await updateUserMonthlySpending(userId, 0.25, 'paid', JUNE_2026);

            expect(txn.update).toHaveBeenCalledWith(userRef, {
                spendings: [{
                    period: '2026-06',
                    amountUSD: 1.75,
                    freeAmountUSD: 1,
                    apiAmountUSD: 0.5,
                    paidAmountUSD: 0.25
                }],
                dailySpend: { period: '2026-06-10', totalUSD: 0.25, buckets: { paid: 0.25 }, limitHits: 0 }
            });
            expect(txn.set).not.toHaveBeenCalled();
        });

        it('appends a new record for a new month and keeps the list sorted descending by period', async () => {
            const { txn } = setupTransaction({
                spendings: [
                    { period: '2026-07', amountUSD: 3 },
                    { period: '2026-05', amountUSD: 2 }
                ]
            });

            await updateUserMonthlySpending(userId, 1, 'free', JUNE_2026);

            const written = txn.update.mock.calls[0][1].spendings as UserMonthlySpending[];
            expect(written.map(r => r.period)).toEqual(['2026-07', '2026-06', '2026-05']);
            expect(written[1]).toEqual({
                period: '2026-06',
                amountUSD: 1,
                freeAmountUSD: 1,
                apiAmountUSD: 0,
                paidAmountUSD: 0
            });
        });

        it('creates the user doc with set(..., {merge: true}) when the user is missing', async () => {
            const { txn, userRef } = setupTransaction(null);

            await updateUserMonthlySpending(userId, 0.5, 'paid', JUNE_2026);

            expect(txn.update).not.toHaveBeenCalled();
            expect(txn.set).toHaveBeenCalledWith(
                userRef,
                {
                    spendings: [{
                        period: '2026-06',
                        amountUSD: 0.5,
                        freeAmountUSD: 0,
                        apiAmountUSD: 0,
                        paidAmountUSD: 0.5
                    }],
                    dailySpend: { period: '2026-06-10', totalUSD: 0.5, buckets: { paid: 0.5 }, limitHits: 0 }
                },
                { merge: true }
            );
        });

        it('only increments the total when no tier is provided', async () => {
            const { txn } = setupTransaction({
                spendings: [{ period: '2026-06', amountUSD: 1, freeAmountUSD: 1, apiAmountUSD: 0, paidAmountUSD: 0 }]
            });

            await updateUserMonthlySpending(userId, 0.5, undefined, JUNE_2026);

            const written = txn.update.mock.calls[0][1].spendings as UserMonthlySpending[];
            // NOTE (pinned current behavior): with no tier, the amount lands in the
            // total but in none of the tier buckets, so buckets won't sum to the total.
            expect(written[0]).toEqual({
                period: '2026-06',
                amountUSD: 1.5,
                freeAmountUSD: 1,
                apiAmountUSD: 0,
                paidAmountUSD: 0
            });
        });

        it('rounds aggregated amounts to 6 decimal places (no float drift)', async () => {
            const { txn } = setupTransaction({
                spendings: [{ period: '2026-06', amountUSD: 0.1, freeAmountUSD: 0.1, apiAmountUSD: 0, paidAmountUSD: 0 }]
            });

            await updateUserMonthlySpending(userId, 0.2, 'free', JUNE_2026);

            const written = txn.update.mock.calls[0][1].spendings as UserMonthlySpending[];
            expect(written[0].amountUSD).toBe(0.3); // not 0.30000000000000004
            expect(written[0].freeAmountUSD).toBe(0.3);
        });

        it('drops malformed legacy spending records (no period) while aggregating', async () => {
            const { txn } = setupTransaction({
                spendings: [
                    { amountUSD: 5 }, // legacy garbage, no period
                    { period: '2026-06', amountUSD: 1 }
                ]
            });

            await updateUserMonthlySpending(userId, 1, 'free', JUNE_2026);

            const written = txn.update.mock.calls[0][1].spendings as UserMonthlySpending[];
            expect(written).toHaveLength(1);
            expect(written[0].amountUSD).toBe(2);
        });
    });
});

describe('deductBalance', () => {
    const userId = 'player@example.com';

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('returns true without a transaction for zero or negative amounts', async () => {
        setupTransaction({ balance: 10 });

        await expect(deductBalance(userId, 0)).resolves.toBe(true);
        await expect(deductBalance(userId, -1)).resolves.toBe(true);
        expect(db!.runTransaction).not.toHaveBeenCalled();
    });

    it('deducts the amount and rounds the new balance to 6 decimal places', async () => {
        const { txn, userRef } = setupTransaction({ balance: 10 });

        await expect(deductBalance(userId, 0.0115)).resolves.toBe(true);

        expect(txn.update).toHaveBeenCalledWith(userRef, { balance: 9.9885 });
    });

    it('allows spending the exact remaining balance down to zero', async () => {
        const { txn, userRef } = setupTransaction({ balance: 0.5 });

        await expect(deductBalance(userId, 0.5)).resolves.toBe(true);

        expect(txn.update).toHaveBeenCalledWith(userRef, { balance: 0 });
    });

    it('returns false and writes nothing when the balance is insufficient', async () => {
        const { txn } = setupTransaction({ balance: 0.01 });

        await expect(deductBalance(userId, 0.02)).resolves.toBe(false);

        expect(txn.update).not.toHaveBeenCalled();
    });

    it('returns false and writes nothing when the user does not exist', async () => {
        const { txn } = setupTransaction(null);

        await expect(deductBalance(userId, 1)).resolves.toBe(false);

        expect(txn.update).not.toHaveBeenCalled();
    });

    it('treats a missing balance field as 0 (insufficient)', async () => {
        const { txn } = setupTransaction({});

        await expect(deductBalance(userId, 0.000001)).resolves.toBe(false);

        expect(txn.update).not.toHaveBeenCalled();
    });
});

describe('addBalance', () => {
    const userId = 'player@example.com';

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('rejects non-positive amounts before touching the database', async () => {
        setupTransaction({ balance: 1, tier: 'free' });

        await expect(addBalance(userId, 0)).rejects.toThrow(/must be positive/);
        await expect(addBalance(userId, -5)).rejects.toThrow(/must be positive/);
        expect(db!.runTransaction).not.toHaveBeenCalled();
    });

    it('throws when the user does not exist', async () => {
        setupTransaction(null);

        await expect(addBalance(userId, 5)).rejects.toThrow(/User not found/);
    });

    it('adds to the balance and auto-switches a free-tier user to paid', async () => {
        const { txn, userRef } = setupTransaction({ balance: 2, tier: 'free' });

        await addBalance(userId, 3);

        expect(txn.update).toHaveBeenCalledWith(userRef, { balance: 5, tier: 'paid' });
    });

    it('treats a missing tier as free and switches it to paid', async () => {
        const { txn, userRef } = setupTransaction({ balance: 0 });

        await addBalance(userId, 1.5);

        expect(txn.update).toHaveBeenCalledWith(userRef, { balance: 1.5, tier: 'paid' });
    });

    it('leaves a paid-tier user on paid (only updates the balance)', async () => {
        const { txn, userRef } = setupTransaction({ balance: 4, tier: 'paid' });

        await addBalance(userId, 1);

        expect(txn.update).toHaveBeenCalledWith(userRef, { balance: 5 });
    });

    it("promotes a stray legacy 'api'-tier account to paid on top-up (the tier no longer exists)", async () => {
        const { txn, userRef } = setupTransaction({ balance: 0, tier: 'api' });

        await addBalance(userId, 10);

        expect(txn.update).toHaveBeenCalledWith(userRef, { balance: 10, tier: 'paid' });
    });

    it('rounds the new balance to 6 decimal places', async () => {
        const { txn, userRef } = setupTransaction({ balance: 0.1, tier: 'paid' });

        await addBalance(userId, 0.2);

        expect(txn.update).toHaveBeenCalledWith(userRef, { balance: 0.3 });
    });
});

describe('assertFreeSpendWithinLimit', () => {
    const userId = 'player@example.com';
    // 2026-06-10 12:00 UTC → day '2026-06-10', month '2026-06'.
    const JUNE_2026 = Date.UTC(2026, 5, 10, 12, 0, 0);

    // Wires db.collection('users').doc(id) to a ref whose get() resolves with the given
    // data and whose set() (the limitHits counter write) is captured.
    function setupDoc(userData: any | null) {
        const set = jest.fn().mockResolvedValue(undefined);
        (db!.collection as jest.Mock).mockReturnValue({
            doc: jest.fn().mockReturnValue({
                get: jest.fn().mockResolvedValue({ exists: userData !== null, data: () => userData }),
                set
            })
        });
        return { set };
    }

    const dayLedger = (free: number, extra: Record<string, any> = {}) =>
        ({ period: '2026-06-10', totalUSD: free, buckets: { free }, limitHits: 0, ...extra });

    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(console, 'warn').mockImplementation(() => {});
    });

    it('passes a user with no spend at all', async () => {
        const { set } = setupDoc({ tier: 'free' });
        await expect(assertFreeSpendWithinLimit(userId, JUNE_2026)).resolves.toBeUndefined();
        expect(set).not.toHaveBeenCalled();
    });

    it('passes below both caps', async () => {
        setupDoc({ tier: 'free', dailySpend: dayLedger(4.99), spendings: [{ period: '2026-06', amountUSD: 19.99, freeAmountUSD: 19.99 }] });
        await expect(assertFreeSpendWithinLimit(userId, JUNE_2026)).resolves.toBeUndefined();
    });

    it('refuses at the daily cap with the money-worded message and counts the hit', async () => {
        const { set } = setupDoc({ tier: 'free', dailySpend: dayLedger(5, { limitHits: 2 }) });

        const error = await assertFreeSpendWithinLimit(userId, JUNE_2026).catch(e => e);
        expect(error).toBeInstanceOf(FreeSpendLimitError);
        expect(error.message).toBe("You've used today's free $5 of AI. Come back after midnight UTC, or add funds on your profile page to keep playing now.");
        expect(error.verdict).toEqual(expect.objectContaining({ window: 'day', limitUSD: 5, spentUSD: 5, resetsAt: Date.UTC(2026, 5, 11) }));
        expect(set).toHaveBeenCalledWith({ dailySpend: dayLedger(5, { limitHits: 3 }) }, { merge: true });
    });

    it('refuses at the monthly cap even when today is under the daily cap', async () => {
        const { set } = setupDoc({
            tier: 'free',
            dailySpend: dayLedger(1),
            spendings: [{ period: '2026-06', amountUSD: 20, freeAmountUSD: 20 }]
        });

        const error = await assertFreeSpendWithinLimit(userId, JUNE_2026).catch(e => e);
        expect(error).toBeInstanceOf(FreeSpendLimitError);
        expect(error.message).toBe("You've used this month's free $20 of AI. It resets on the 1st, or add funds on your profile page to keep playing now.");
        expect(error.verdict.window).toBe('month');
        expect(set).toHaveBeenCalledWith({ dailySpend: dayLedger(1, { limitHits: 1 }) }, { merge: true });
    });

    it('a stale daily ledger counts as zero today (and the hit lands on a fresh ledger)', async () => {
        const { set } = setupDoc({
            tier: 'free',
            dailySpend: { period: '2026-06-09', totalUSD: 5, buckets: { free: 5 }, limitHits: 4 },
            spendings: [{ period: '2026-06', amountUSD: 20, freeAmountUSD: 20 }]
        });
        await expect(assertFreeSpendWithinLimit(userId, JUNE_2026)).rejects.toThrow(/this month's/);
        expect(set).toHaveBeenCalledWith({ dailySpend: { period: '2026-06-10', totalUSD: 0, buckets: {}, limitHits: 1 } }, { merge: true });
    });

    it('only the free bucket counts, not paid spend in the same windows', async () => {
        setupDoc({
            tier: 'free',
            dailySpend: { period: '2026-06-10', totalUSD: 100.5, buckets: { free: 0.5, paid: 100 } },
            spendings: [{ period: '2026-06', amountUSD: 100.5, freeAmountUSD: 0.5, paidAmountUSD: 100 }]
        });
        await expect(assertFreeSpendWithinLimit(userId, JUNE_2026)).resolves.toBeUndefined();
    });

    it('ignores spend from other months', async () => {
        setupDoc({ tier: 'free', spendings: [{ period: '2026-05', amountUSD: 100, freeAmountUSD: 100 }] });
        await expect(assertFreeSpendWithinLimit(userId, JUNE_2026)).resolves.toBeUndefined();
    });

    it('paid tier is exempt no matter what the free ledgers say', async () => {
        setupDoc({ tier: 'paid', dailySpend: dayLedger(50), spendings: [{ period: '2026-06', amountUSD: 500, freeAmountUSD: 500 }] });
        await expect(assertFreeSpendWithinLimit(userId, JUNE_2026)).resolves.toBeUndefined();
        expect(getFreeTierLimits).not.toHaveBeenCalled();
    });

    it('reads the caps from config, not the constants', async () => {
        (getFreeTierLimits as jest.Mock).mockResolvedValueOnce({ gamesPerDay: 5, dailySpendUSD: 0.5, monthlySpendUSD: 20 });
        setupDoc({ tier: 'free', dailySpend: dayLedger(0.5) });
        await expect(assertFreeSpendWithinLimit(userId, JUNE_2026)).rejects.toThrow(/today's free \$0\.50 of AI/);
    });

    it('passes when the user doc does not exist', async () => {
        setupDoc(null);
        await expect(assertFreeSpendWithinLimit(userId, JUNE_2026)).resolves.toBeUndefined();
    });
});
