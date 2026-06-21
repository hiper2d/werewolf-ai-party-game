import {
    recordGameMasterTokenUsage,
    recordBotTokenUsage,
    recordGameCost,
    getGameTier
} from './cost-tracking';
import { db } from "@/firebase/server";
import { PAID_TIER_MARKUP } from "@/app/config/credit-packages";

// Mock Firestore. Charging is now done INSIDE the same transaction as the game
// cost commit (atomic), so there is no longer any delegation to user-actions to
// mock — we assert the writes the transaction makes directly.
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
 * Wires db.collection('games').doc(id) and db.collection('users').doc(email) to
 * stable refs, and makes db.runTransaction invoke its callback with a fake
 * transaction whose get(ref) resolves to the right snapshot (game vs user).
 * Pass `userData` (or undefined) to model the charging user's current doc.
 */
function setupTransaction(
    gameData: any | null,
    userData: any | null | undefined = undefined
): { txn: FakeTransaction; gameRef: any; userRef: any } {
    const gameSnapshot = { exists: gameData !== null, data: () => gameData };
    const userSnapshot = { exists: userData !== null && userData !== undefined, data: () => userData };

    const gameRef = { id: 'games/fake', get: jest.fn().mockResolvedValue(gameSnapshot) };
    const userRef = { id: 'users/fake', get: jest.fn().mockResolvedValue(userSnapshot) };

    (db!.collection as jest.Mock).mockImplementation((name: string) => ({
        doc: jest.fn().mockReturnValue(name === 'users' ? userRef : gameRef)
    }));

    const txn: FakeTransaction = {
        get: jest.fn().mockImplementation((ref: any) =>
            Promise.resolve(ref === userRef ? userSnapshot : gameSnapshot)
        ),
        set: jest.fn(),
        update: jest.fn()
    };
    (db!.runTransaction as jest.Mock).mockImplementation(async (cb: any) => cb(txn));

    return { txn, gameRef, userRef };
}

/** Find the transaction write (update or set) made against the user doc. */
function userWrite(txn: FakeTransaction, userRef: any): any | undefined {
    const fromUpdate = txn.update.mock.calls.find(call => call[0] === userRef);
    if (fromUpdate) return fromUpdate[1];
    const fromSet = txn.set.mock.calls.find(call => call[0] === userRef);
    return fromSet ? fromSet[1] : undefined;
}

describe('cost-tracking', () => {
    const gameId = 'game-1';
    const userEmail = 'player@example.com';

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('recordGameMasterTokenUsage', () => {
        it('accumulates token usage and total game cost, computing totalTokens when not supplied', async () => {
            const { txn, gameRef } = setupTransaction({
                gameMasterTokenUsage: { inputTokens: 100, outputTokens: 50, totalTokens: 150, costUSD: 0.5 },
                totalGameCost: 1.25
            }, { tier: 'free' });

            await recordGameMasterTokenUsage(gameId, {
                inputTokens: 10,
                outputTokens: 5,
                costUSD: 0.0001
            }, userEmail);

            expect(txn.update).toHaveBeenCalledWith(gameRef, {
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
            const { txn, gameRef } = setupTransaction({ totalGameCost: 0 }, { tier: 'free' });

            await recordGameMasterTokenUsage(gameId, {
                inputTokens: 10,
                outputTokens: 5,
                totalTokens: 999, // e.g. provider includes reasoning tokens
                costUSD: 0.01
            }, userEmail);

            expect(txn.update).toHaveBeenCalledWith(gameRef, expect.objectContaining({
                gameMasterTokenUsage: expect.objectContaining({ totalTokens: 999 })
            }));
        });

        it('normalizes malformed token fields to 0 and rounds cost to 6 decimal places', async () => {
            const { txn, gameRef } = setupTransaction({}, { tier: 'free' });

            await recordGameMasterTokenUsage(gameId, {
                inputTokens: 'garbage' as any,
                outputTokens: undefined,
                costUSD: 0.1234567891
            }, userEmail);

            expect(txn.update).toHaveBeenCalledWith(gameRef, {
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
            setupTransaction({}, { tier: 'free' });

            await recordGameMasterTokenUsage(gameId, null, userEmail);

            expect(db!.runTransaction).not.toHaveBeenCalled();
        });

        it('does not update or charge when the game does not exist', async () => {
            const { txn, userRef } = setupTransaction(null, { tier: 'paid', balance: 100 });

            await recordGameMasterTokenUsage(gameId, { inputTokens: 1, outputTokens: 1, costUSD: 1 }, userEmail);

            expect(txn.update).not.toHaveBeenCalled();
            expect(userWrite(txn, userRef)).toBeUndefined();
        });

        describe('paid tier charging (markup math)', () => {
            it('deducts cost * (1 + PAID_TIER_MARKUP) from balance and records the marked-up amount in the SAME transaction as the game cost', async () => {
                const { txn, gameRef, userRef } = setupTransaction(
                    { totalGameCost: 0 },
                    { tier: 'paid', balance: 100 }
                );

                await recordGameMasterTokenUsage(gameId, { inputTokens: 1, outputTokens: 1, costUSD: 2 }, userEmail);

                // 2 * (1 + 0.15) = 2.3
                expect(PAID_TIER_MARKUP).toBe(0.15);
                const write = userWrite(txn, userRef);
                expect(write.balance).toBe(97.7); // 100 - 2.3
                // Monthly spending records what the user was actually billed (2.3).
                expect(write.spendings).toEqual(
                    expect.arrayContaining([expect.objectContaining({ amountUSD: 2.3, paidAmountUSD: 2.3 })])
                );
                // The game cost commit happens in the same transaction.
                expect(txn.update).toHaveBeenCalledWith(gameRef, expect.objectContaining({ totalGameCost: 2 }));
            });

            it('rounds the charged amount to 6 decimal places', async () => {
                const { txn, userRef } = setupTransaction({ totalGameCost: 0 }, { tier: 'paid', balance: 100 });

                await recordGameMasterTokenUsage(gameId, { inputTokens: 1, outputTokens: 1, costUSD: 0.012345 }, userEmail);

                // 0.012345 * 1.15 = 0.01419675 -> 0.014197 at 6dp
                expect(userWrite(txn, userRef).balance).toBe(parseFloat((100 - 0.014197).toFixed(6)));
            });

            it('throws on insufficient balance WITHOUT committing the game cost (atomic)', async () => {
                const { txn, gameRef } = setupTransaction({ totalGameCost: 0 }, { tier: 'paid', balance: 1 });

                await expect(
                    recordGameMasterTokenUsage(gameId, { inputTokens: 1, outputTokens: 1, costUSD: 1 }, userEmail)
                ).rejects.toThrow(/Insufficient balance/);

                // Nothing is written — not the charge, not the game cost.
                expect(txn.update).not.toHaveBeenCalledWith(gameRef, expect.anything());
            });
        });

        it('free tier: never deducts balance but still records monthly spending', async () => {
            const { txn, userRef } = setupTransaction({ totalGameCost: 0 }, { tier: 'free' });

            await recordGameMasterTokenUsage(gameId, { inputTokens: 1, outputTokens: 1, costUSD: 0.5 }, userEmail);

            const write = userWrite(txn, userRef);
            expect(write).not.toHaveProperty('balance');
            expect(write.spendings).toEqual(
                expect.arrayContaining([expect.objectContaining({ amountUSD: 0.5, freeAmountUSD: 0.5 })])
            );
        });

        it('api tier: never deducts balance but still records monthly spending', async () => {
            const { txn, userRef } = setupTransaction({ totalGameCost: 0 }, { tier: 'api' });

            await recordGameMasterTokenUsage(gameId, { inputTokens: 1, outputTokens: 1, costUSD: 0.5 }, userEmail);

            const write = userWrite(txn, userRef);
            expect(write).not.toHaveProperty('balance');
            expect(write.spendings).toEqual(
                expect.arrayContaining([expect.objectContaining({ amountUSD: 0.5, apiAmountUSD: 0.5 })])
            );
        });

        it('keys off the user CURRENT tier, not the game tier: a now-paid user IS charged for a legacy/free game (#8)', async () => {
            // Charging reads the user's tier inside the transaction. A game with no
            // createdWithTier played by a now-paid user is billed with markup.
            const { txn, userRef } = setupTransaction({ totalGameCost: 0 }, { tier: 'paid', balance: 100 });

            await recordGameMasterTokenUsage(gameId, { inputTokens: 1, outputTokens: 1, costUSD: 0.5 }, userEmail);

            // 0.5 * 1.15 = 0.575
            expect(userWrite(txn, userRef).balance).toBe(99.425); // 100 - 0.575
        });

        it('free user is NOT charged, but the same user IS once upgraded to paid (#8)', async () => {
            // user still free → no balance change
            let setup = setupTransaction({ totalGameCost: 0 }, { tier: 'free' });
            await recordGameMasterTokenUsage(gameId, { inputTokens: 1, outputTokens: 1, costUSD: 0.5 }, userEmail);
            expect(userWrite(setup.txn, setup.userRef)).not.toHaveProperty('balance');

            // same game, user has since upgraded to paid → now charged
            jest.clearAllMocks();
            setup = setupTransaction({ totalGameCost: 0 }, { tier: 'paid', balance: 100 });
            await recordGameMasterTokenUsage(gameId, { inputTokens: 1, outputTokens: 1, costUSD: 0.5 }, userEmail);
            expect(userWrite(setup.txn, setup.userRef).balance).toBe(99.425);
        });

        it('zero-cost usage: game tokens recorded but no balance deduction or spending entry', async () => {
            const { txn, gameRef, userRef } = setupTransaction({ totalGameCost: 0 }, { tier: 'paid', balance: 100 });

            await recordGameMasterTokenUsage(gameId, { inputTokens: 10, outputTokens: 10, costUSD: 0 }, userEmail);

            expect(txn.update).toHaveBeenCalledWith(gameRef, expect.anything()); // token counts still accumulate
            expect(userWrite(txn, userRef)).toBeUndefined();
        });

        it('missing userEmail: game cost recorded but no user doc touched', async () => {
            const { txn, gameRef, userRef } = setupTransaction({ totalGameCost: 0 }, { tier: 'paid', balance: 100 });

            await recordGameMasterTokenUsage(gameId, { inputTokens: 1, outputTokens: 1, costUSD: 1 }, undefined);

            expect(txn.update).toHaveBeenCalledWith(gameRef, expect.anything());
            expect(userWrite(txn, userRef)).toBeUndefined();
        });
    });

    describe('recordBotTokenUsage', () => {
        const bots = [
            { name: 'Alice', tokenUsage: { inputTokens: 10, outputTokens: 10, totalTokens: 20, costUSD: 0.1 } },
            { name: 'Bob' } // no usage yet
        ];

        it('accumulates usage on the matching bot only, bumps totalGameCost, and charges in the same transaction', async () => {
            const { txn, gameRef, userRef } = setupTransaction(
                {
                    bots: JSON.parse(JSON.stringify(bots)),
                    totalGameCost: 0.1
                },
                { tier: 'paid', balance: 100 }
            );

            await recordBotTokenUsage(gameId, 'Bob', { inputTokens: 5, outputTokens: 5, costUSD: 0.2 }, userEmail);

            expect(txn.update).toHaveBeenCalledWith(gameRef, {
                bots: [
                    bots[0], // Alice untouched
                    {
                        name: 'Bob',
                        tokenUsage: { inputTokens: 5, outputTokens: 5, totalTokens: 10, costUSD: 0.2 }
                    }
                ],
                totalGameCost: 0.3
            });
            // Paid tier: charged with markup in the same transaction (0.2 * 1.15 = 0.23)
            const write = userWrite(txn, userRef);
            expect(write.balance).toBe(99.77); // 100 - 0.23
            expect(write.spendings).toEqual(
                expect.arrayContaining([expect.objectContaining({ amountUSD: 0.23, paidAmountUSD: 0.23 })])
            );
        });

        it('does not update or charge when the bot is not found', async () => {
            const { txn, userRef } = setupTransaction(
                {
                    bots: JSON.parse(JSON.stringify(bots)),
                    totalGameCost: 0.1
                },
                { tier: 'paid', balance: 100 }
            );

            await recordBotTokenUsage(gameId, 'Nobody', { inputTokens: 5, outputTokens: 5, costUSD: 0.2 }, userEmail);

            expect(txn.update).not.toHaveBeenCalled();
            expect(userWrite(txn, userRef)).toBeUndefined();
        });

        it('does not update or charge when the game does not exist', async () => {
            const { txn, userRef } = setupTransaction(null, { tier: 'paid', balance: 100 });

            await recordBotTokenUsage(gameId, 'Alice', { inputTokens: 5, outputTokens: 5, costUSD: 0.2 }, userEmail);

            expect(txn.update).not.toHaveBeenCalled();
            expect(userWrite(txn, userRef)).toBeUndefined();
        });
    });

    describe('recordGameCost', () => {
        it('adds a normalized positive amount to totalGameCost', async () => {
            const { txn, gameRef } = setupTransaction({ totalGameCost: 0.1 });

            await recordGameCost(gameId, 0.2);

            expect(txn.update).toHaveBeenCalledWith(gameRef, { totalGameCost: 0.3 });
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
