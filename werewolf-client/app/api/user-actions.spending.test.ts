import { updateUserMonthlySpending, deductBalance } from './user-actions';
import { db } from "@/firebase/server";
import { UserMonthlySpending } from "@/app/api/game-models";

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
                }]
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

            await updateUserMonthlySpending(userId, 0.5, 'api', JUNE_2026);

            expect(txn.update).not.toHaveBeenCalled();
            expect(txn.set).toHaveBeenCalledWith(
                userRef,
                {
                    spendings: [{
                        period: '2026-06',
                        amountUSD: 0.5,
                        freeAmountUSD: 0,
                        apiAmountUSD: 0.5,
                        paidAmountUSD: 0
                    }]
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
