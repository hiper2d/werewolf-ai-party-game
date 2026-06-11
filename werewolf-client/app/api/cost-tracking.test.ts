import {
    recordGameMasterTokenUsage,
    recordBotTokenUsage,
    recordGameCost,
    getGameTier
} from './cost-tracking';
import { db } from "@/firebase/server";
import { updateUserMonthlySpending, deductBalance } from "@/app/api/user-actions";
import { PAID_TIER_MARKUP } from "@/app/config/credit-packages";

// Mock dependencies (same pattern as night-replay.test.ts)
jest.mock("@/firebase/server", () => ({
    db: {
        collection: jest.fn(),
        runTransaction: jest.fn()
    }
}));

jest.mock("@/app/api/user-actions", () => ({
    updateUserMonthlySpending: jest.fn(),
    deductBalance: jest.fn()
}));

type FakeTransaction = {
    get: jest.Mock;
    set: jest.Mock;
    update: jest.Mock;
};

/**
 * Wires db.collection('games').doc(id) to a stable doc ref and makes
 * db.runTransaction invoke its callback with a fake transaction whose
 * get() resolves to the provided game data (or a missing snapshot).
 */
function setupTransaction(gameData: any | null): { txn: FakeTransaction; docRef: any } {
    const docRef = { id: 'fake-game-ref' };

    const txn: FakeTransaction = {
        get: jest.fn().mockResolvedValue({
            exists: gameData !== null,
            data: () => gameData
        }),
        set: jest.fn(),
        update: jest.fn()
    };

    (db!.collection as jest.Mock).mockReturnValue({
        doc: jest.fn().mockReturnValue(docRef)
    });
    (db!.runTransaction as jest.Mock).mockImplementation(async (cb: any) => cb(txn));

    return { txn, docRef };
}

describe('cost-tracking', () => {
    const gameId = 'game-1';
    const userEmail = 'player@example.com';

    beforeEach(() => {
        jest.clearAllMocks();
        (deductBalance as jest.Mock).mockResolvedValue(true);
        (updateUserMonthlySpending as jest.Mock).mockResolvedValue(undefined);
    });

    describe('recordGameMasterTokenUsage', () => {
        it('accumulates token usage and total game cost, computing totalTokens when not supplied', async () => {
            const { txn, docRef } = setupTransaction({
                createdWithTier: 'free',
                gameMasterTokenUsage: { inputTokens: 100, outputTokens: 50, totalTokens: 150, costUSD: 0.5 },
                totalGameCost: 1.25
            });

            await recordGameMasterTokenUsage(gameId, {
                inputTokens: 10,
                outputTokens: 5,
                costUSD: 0.0001
            }, userEmail);

            expect(txn.update).toHaveBeenCalledWith(docRef, {
                gameMasterTokenUsage: {
                    inputTokens: 110,
                    outputTokens: 55,
                    totalTokens: 165, // 150 + (10 + 5) computed from input+output
                    costUSD: 0.5001
                },
                totalGameCost: 1.2501
            });
        });

        it('prefers a supplied positive totalTokens over the computed sum', async () => {
            const { txn, docRef } = setupTransaction({
                createdWithTier: 'free',
                totalGameCost: 0
            });

            await recordGameMasterTokenUsage(gameId, {
                inputTokens: 10,
                outputTokens: 5,
                totalTokens: 999, // e.g. provider includes reasoning tokens
                costUSD: 0.01
            }, userEmail);

            expect(txn.update).toHaveBeenCalledWith(docRef, expect.objectContaining({
                gameMasterTokenUsage: expect.objectContaining({ totalTokens: 999 })
            }));
        });

        it('normalizes malformed token fields to 0 and rounds cost to 6 decimal places', async () => {
            const { txn, docRef } = setupTransaction({ createdWithTier: 'free' });

            await recordGameMasterTokenUsage(gameId, {
                inputTokens: 'garbage' as any,
                outputTokens: undefined,
                costUSD: 0.1234567891
            }, userEmail);

            expect(txn.update).toHaveBeenCalledWith(docRef, {
                gameMasterTokenUsage: {
                    inputTokens: 0,
                    outputTokens: 0,
                    totalTokens: 0,
                    costUSD: 0.123457 // 6dp rounding
                },
                totalGameCost: 0.123457
            });
        });

        it('does nothing when tokenUsage is null', async () => {
            setupTransaction({ createdWithTier: 'free' });

            await recordGameMasterTokenUsage(gameId, null, userEmail);

            expect(db!.runTransaction).not.toHaveBeenCalled();
            expect(deductBalance).not.toHaveBeenCalled();
            expect(updateUserMonthlySpending).not.toHaveBeenCalled();
        });

        it('does not update or apply spending when the game does not exist', async () => {
            const { txn } = setupTransaction(null);

            await recordGameMasterTokenUsage(gameId, { inputTokens: 1, outputTokens: 1, costUSD: 1 }, userEmail);

            expect(txn.update).not.toHaveBeenCalled();
            expect(deductBalance).not.toHaveBeenCalled();
            expect(updateUserMonthlySpending).not.toHaveBeenCalled();
        });

        describe('paid tier charging (markup math)', () => {
            it('deducts cost * (1 + PAID_TIER_MARKUP) from balance and records the RAW cost as monthly spending', async () => {
                setupTransaction({ createdWithTier: 'paid', totalGameCost: 0 });

                await recordGameMasterTokenUsage(gameId, { inputTokens: 1, outputTokens: 1, costUSD: 2 }, userEmail);

                // 2 * (1 + 0.15) = 2.3
                expect(PAID_TIER_MARKUP).toBe(0.15);
                expect(deductBalance).toHaveBeenCalledWith(userEmail, 2.3);
                // NOTE (pinned current behavior): the monthly spending record stores the raw
                // model cost (2), not the marked-up amount actually charged (2.3). Spendings
                // therefore understate what the paid user was billed by the markup factor.
                expect(updateUserMonthlySpending).toHaveBeenCalledWith(userEmail, 2, 'paid');
            });

            it('rounds the charged amount to 6 decimal places', async () => {
                setupTransaction({ createdWithTier: 'paid', totalGameCost: 0 });

                await recordGameMasterTokenUsage(gameId, { inputTokens: 1, outputTokens: 1, costUSD: 0.012345 }, userEmail);

                // 0.012345 * 1.15 = 0.01419675 -> 0.014197 at 6dp
                expect(deductBalance).toHaveBeenCalledWith(userEmail, 0.014197);
            });

            it('throws when balance deduction fails (insufficient balance)', async () => {
                setupTransaction({ createdWithTier: 'paid', totalGameCost: 0 });
                (deductBalance as jest.Mock).mockResolvedValue(false);

                await expect(
                    recordGameMasterTokenUsage(gameId, { inputTokens: 1, outputTokens: 1, costUSD: 1 }, userEmail)
                ).rejects.toThrow(/Insufficient balance/);

                expect(updateUserMonthlySpending).not.toHaveBeenCalled();
            });
        });

        it('free tier: never deducts balance but still records monthly spending', async () => {
            setupTransaction({ createdWithTier: 'free', totalGameCost: 0 });

            await recordGameMasterTokenUsage(gameId, { inputTokens: 1, outputTokens: 1, costUSD: 0.5 }, userEmail);

            expect(deductBalance).not.toHaveBeenCalled();
            expect(updateUserMonthlySpending).toHaveBeenCalledWith(userEmail, 0.5, 'free');
        });

        it('api tier: never deducts balance but still records monthly spending', async () => {
            setupTransaction({ createdWithTier: 'api', totalGameCost: 0 });

            await recordGameMasterTokenUsage(gameId, { inputTokens: 1, outputTokens: 1, costUSD: 0.5 }, userEmail);

            expect(deductBalance).not.toHaveBeenCalled();
            expect(updateUserMonthlySpending).toHaveBeenCalledWith(userEmail, 0.5, 'api');
        });

        it('paid tier game with no createdWithTier (legacy game): pinned behavior — user is NOT charged', async () => {
            // NOTE (pinned current behavior): charging keys off game.createdWithTier, not the
            // user's current tier. A legacy/undefined-tier game played by a paid user incurs
            // no balance deduction. Related to the open Stripe top-up/tier bug: any path where
            // the tier is not 'paid' (e.g. tier never flipped after a top-up) goes unbilled.
            setupTransaction({ totalGameCost: 0 });

            await recordGameMasterTokenUsage(gameId, { inputTokens: 1, outputTokens: 1, costUSD: 0.5 }, userEmail);

            expect(deductBalance).not.toHaveBeenCalled();
            expect(updateUserMonthlySpending).toHaveBeenCalledWith(userEmail, 0.5, undefined);
        });

        it('zero-cost usage: game tokens recorded but no balance deduction or spending entry', async () => {
            const { txn } = setupTransaction({ createdWithTier: 'paid', totalGameCost: 0 });

            await recordGameMasterTokenUsage(gameId, { inputTokens: 10, outputTokens: 10, costUSD: 0 }, userEmail);

            expect(txn.update).toHaveBeenCalled(); // token counts still accumulate
            expect(deductBalance).not.toHaveBeenCalled();
            expect(updateUserMonthlySpending).not.toHaveBeenCalled();
        });

        it('missing userEmail: game cost recorded but no user spending applied', async () => {
            const { txn } = setupTransaction({ createdWithTier: 'paid', totalGameCost: 0 });

            await recordGameMasterTokenUsage(gameId, { inputTokens: 1, outputTokens: 1, costUSD: 1 }, undefined);

            expect(txn.update).toHaveBeenCalled();
            expect(deductBalance).not.toHaveBeenCalled();
            expect(updateUserMonthlySpending).not.toHaveBeenCalled();
        });
    });

    describe('recordBotTokenUsage', () => {
        const bots = [
            { name: 'Alice', tokenUsage: { inputTokens: 10, outputTokens: 10, totalTokens: 20, costUSD: 0.1 } },
            { name: 'Bob' } // no usage yet
        ];

        it('accumulates usage on the matching bot only and bumps totalGameCost', async () => {
            const { txn, docRef } = setupTransaction({
                createdWithTier: 'paid',
                bots: JSON.parse(JSON.stringify(bots)),
                totalGameCost: 0.1
            });

            await recordBotTokenUsage(gameId, 'Bob', { inputTokens: 5, outputTokens: 5, costUSD: 0.2 }, userEmail);

            expect(txn.update).toHaveBeenCalledWith(docRef, {
                bots: [
                    bots[0], // Alice untouched
                    {
                        name: 'Bob',
                        tokenUsage: { inputTokens: 5, outputTokens: 5, totalTokens: 10, costUSD: 0.2 }
                    }
                ],
                totalGameCost: 0.3
            });
            // Paid tier: charged with markup, raw cost recorded
            expect(deductBalance).toHaveBeenCalledWith(userEmail, 0.23);
            expect(updateUserMonthlySpending).toHaveBeenCalledWith(userEmail, 0.2, 'paid');
        });

        it('does not update or apply spending when the bot is not found', async () => {
            const { txn } = setupTransaction({
                createdWithTier: 'paid',
                bots: JSON.parse(JSON.stringify(bots)),
                totalGameCost: 0.1
            });

            await recordBotTokenUsage(gameId, 'Nobody', { inputTokens: 5, outputTokens: 5, costUSD: 0.2 }, userEmail);

            expect(txn.update).not.toHaveBeenCalled();
            expect(deductBalance).not.toHaveBeenCalled();
            expect(updateUserMonthlySpending).not.toHaveBeenCalled();
        });

        it('does not apply spending when the game does not exist', async () => {
            const { txn } = setupTransaction(null);

            await recordBotTokenUsage(gameId, 'Alice', { inputTokens: 5, outputTokens: 5, costUSD: 0.2 }, userEmail);

            expect(txn.update).not.toHaveBeenCalled();
            expect(updateUserMonthlySpending).not.toHaveBeenCalled();
        });
    });

    describe('recordGameCost', () => {
        it('adds a normalized positive amount to totalGameCost', async () => {
            const { txn, docRef } = setupTransaction({ totalGameCost: 0.1 });

            await recordGameCost(gameId, 0.2);

            expect(txn.update).toHaveBeenCalledWith(docRef, { totalGameCost: 0.3 });
        });

        it('ignores zero, negative and NaN amounts', async () => {
            setupTransaction({ totalGameCost: 0.1 });

            await recordGameCost(gameId, 0);
            await recordGameCost(gameId, -5);
            await recordGameCost(gameId, NaN);

            expect(db!.runTransaction).not.toHaveBeenCalled();
        });

        it('ignores missing gameId', async () => {
            setupTransaction({ totalGameCost: 0.1 });

            await recordGameCost(undefined, 1);

            expect(db!.runTransaction).not.toHaveBeenCalled();
        });
    });

    describe('getGameTier', () => {
        function setupDirectGet(gameData: any | null) {
            (db!.collection as jest.Mock).mockReturnValue({
                doc: jest.fn().mockReturnValue({
                    get: jest.fn().mockResolvedValue({
                        exists: gameData !== null,
                        data: () => gameData
                    })
                })
            });
        }

        it('returns the tier the game was created with', async () => {
            setupDirectGet({ createdWithTier: 'paid' });
            await expect(getGameTier(gameId)).resolves.toBe('paid');
        });

        it('returns undefined for a missing game or missing gameId', async () => {
            setupDirectGet(null);
            await expect(getGameTier(gameId)).resolves.toBeUndefined();
            await expect(getGameTier(undefined)).resolves.toBeUndefined();
        });
    });
});
