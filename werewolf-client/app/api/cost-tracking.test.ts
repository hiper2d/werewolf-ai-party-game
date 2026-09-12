import {
    recordGameMasterTokenUsage,
    recordBotTokenUsage,
    recordSpend,
    incrementGameCost,
    getGameTier
} from './cost-tracking';
import { db } from "@/firebase/server";
import { PAID_TIER_MARKUP } from "@/app/config/credit-packages";
import { SupportedAiModels } from "@/app/ai/ai-models";

jest.mock('@/app/utils/logger', () => ({
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

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
): { txn: FakeTransaction; gameRef: any; userRef: any; statRef: any } {
    const gameSnapshot = { exists: gameData !== null, data: () => gameData };
    const userSnapshot = { exists: userData !== null && userData !== undefined, data: () => userData };

    const gameRef = { id: 'games/fake', get: jest.fn().mockResolvedValue(gameSnapshot) };
    const userRef = { id: 'users/fake', get: jest.fn().mockResolvedValue(userSnapshot) };
    const statRef = { id: 'requestStats/fake' };

    (db!.collection as jest.Mock).mockImplementation((name: string) => ({
        doc: jest.fn().mockReturnValue(
            name === 'users' ? userRef : name === 'requestStats' ? statRef : gameRef
        )
    }));

    const txn: FakeTransaction = {
        get: jest.fn().mockImplementation((ref: any) =>
            Promise.resolve(ref === userRef ? userSnapshot : gameSnapshot)
        ),
        set: jest.fn(),
        update: jest.fn()
    };
    (db!.runTransaction as jest.Mock).mockImplementation(async (cb: any) => cb(txn));

    return { txn, gameRef, userRef, statRef };
}

/** Find the requestStats document written by the transaction, if any. */
function statWrite(txn: FakeTransaction, statRef: any): any | undefined {
    const call = txn.set.mock.calls.find(c => c[0] === statRef);
    return call ? call[1] : undefined;
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

        it('accumulates reasoningTokens onto the existing breakdown', async () => {
            const { txn, gameRef } = setupTransaction({
                gameMasterTokenUsage: {
                    inputTokens: 100, outputTokens: 50, totalTokens: 150, costUSD: 0.5, reasoningTokens: 30
                },
                totalGameCost: 0.5
            }, { tier: 'free' });

            await recordGameMasterTokenUsage(gameId, {
                inputTokens: 10, outputTokens: 20, costUSD: 0.01, reasoningTokens: 15
            }, userEmail);

            expect(txn.update).toHaveBeenCalledWith(gameRef, expect.objectContaining({
                gameMasterTokenUsage: expect.objectContaining({ outputTokens: 70, reasoningTokens: 45 })
            }));
        });

        it('carries a first-ever reasoningTokens onto a doc that has no breakdown yet', async () => {
            const { txn, gameRef } = setupTransaction({ totalGameCost: 0 }, { tier: 'free' });

            await recordGameMasterTokenUsage(gameId, {
                inputTokens: 10, outputTokens: 20, costUSD: 0.01, reasoningTokens: 12
            }, userEmail);

            expect(txn.update).toHaveBeenCalledWith(gameRef, expect.objectContaining({
                gameMasterTokenUsage: expect.objectContaining({ reasoningTokens: 12 })
            }));
        });

        it('omits reasoningTokens entirely for non-reasoning models (Firestore rejects undefined)', async () => {
            const { txn, gameRef } = setupTransaction({ totalGameCost: 0 }, { tier: 'free' });

            await recordGameMasterTokenUsage(gameId, {
                inputTokens: 10, outputTokens: 5, costUSD: 0.01
            }, userEmail);

            const gameCall = txn.update.mock.calls.find(([ref]: any[]) => ref === gameRef);
            expect('reasoningTokens' in gameCall[1].gameMasterTokenUsage).toBe(false);
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

        it("a stray legacy 'api' tier string bills as free: no balance deduction, spend in the free bucket", async () => {
            const { txn, userRef } = setupTransaction({ totalGameCost: 0 }, { tier: 'api' });

            await recordGameMasterTokenUsage(gameId, { inputTokens: 1, outputTokens: 1, costUSD: 0.5 }, userEmail);

            const write = userWrite(txn, userRef);
            expect(write).not.toHaveProperty('balance');
            expect(write.spendings).toEqual(
                expect.arrayContaining([expect.objectContaining({ amountUSD: 0.5, freeAmountUSD: 0.5, apiAmountUSD: 0 })])
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

        it('accumulates reasoningTokens on the matching bot', async () => {
            const withReasoning = [
                {
                    name: 'Alice',
                    tokenUsage: { inputTokens: 10, outputTokens: 10, totalTokens: 20, costUSD: 0.1, reasoningTokens: 6 }
                }
            ];
            const { txn, gameRef } = setupTransaction(
                { bots: JSON.parse(JSON.stringify(withReasoning)), totalGameCost: 0.1 },
                { tier: 'free' }
            );

            await recordBotTokenUsage(
                gameId, 'Alice', { inputTokens: 5, outputTokens: 8, costUSD: 0.2, reasoningTokens: 4 }, userEmail
            );

            expect(txn.update).toHaveBeenCalledWith(gameRef, expect.objectContaining({
                bots: [expect.objectContaining({
                    name: 'Alice',
                    tokenUsage: expect.objectContaining({ outputTokens: 18, reasoningTokens: 10 })
                })]
            }));
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

    describe('recordSpend (the one chokepoint for non-turn spend)', () => {
        // 2026-09-11T15:00Z → day ledger period '2026-09-11', month '2026-09'.
        const T = Date.UTC(2026, 8, 11, 15, 0, 0);
        const [knownModelId, knownConfig] = Object.entries(SupportedAiModels)[0];

        it('preview (no game): charges the user, moves both ledgers, writes a kind-tagged stats row', async () => {
            const { txn, userRef, statRef } = setupTransaction(null, { tier: 'free', spendings: [] });

            await recordSpend({
                userEmail, costUSD: 0.5, kind: 'preview', modelId: knownModelId,
                usage: { inputTokens: 100, outputTokens: 50 }
            }, T);

            const user = userWrite(txn, userRef);
            expect(user.spendings).toEqual([{ period: '2026-09', amountUSD: 0.5, freeAmountUSD: 0.5, apiAmountUSD: 0, paidAmountUSD: 0 }]);
            expect(user.dailySpend).toEqual({ period: '2026-09-11', totalUSD: 0.5, buckets: { free: 0.5 }, limitHits: 0 });
            // No game to touch.
            expect(txn.update.mock.calls.filter(c => c[0] !== userRef)).toHaveLength(0);
            const stat = statWrite(txn, statRef);
            expect(stat).toEqual(expect.objectContaining({
                userId: userEmail, tier: 'free', kind: 'preview', modelId: knownModelId,
                modelApiName: knownConfig.modelApiName, apiKeyName: knownConfig.apiKeyName,
                inputTokens: 100, outputTokens: 50, totalTokens: 150, costUSD: 0.5, status: 'ok'
            }));
            expect(stat.actor).toBeUndefined();
            expect(stat.gameId).toBeUndefined();
        });

        it('voice with a game: adds the cost to the game total in the same transaction', async () => {
            const { txn, gameRef, statRef } = setupTransaction({ totalGameCost: 0.1 }, { tier: 'free' });

            await recordSpend({
                userEmail, costUSD: 0.2, kind: 'tts', gameId, modelId: 'gpt-4o-mini-tts', apiKeyName: 'OPENAI_API_KEY',
                gameUpdate: incrementGameCost(0.2)
            }, T);

            expect(txn.update).toHaveBeenCalledWith(gameRef, { totalGameCost: 0.3 });
            expect(statWrite(txn, statRef)).toEqual(expect.objectContaining({
                gameId, kind: 'tts', modelId: 'gpt-4o-mini-tts', modelApiName: 'gpt-4o-mini-tts', apiKeyName: 'OPENAI_API_KEY', costUSD: 0.2
            }));
        });

        it('images: carries imageCount and the caller-supplied provider key name', async () => {
            const { txn, statRef } = setupTransaction(null, { tier: 'free' });

            await recordSpend({ userEmail, costUSD: 0.08, kind: 'image', modelId: 'gemini-3.1-flash-image', apiKeyName: 'GOOGLE_API_KEY', gameId, imageCount: 1 }, T);

            expect(statWrite(txn, statRef)).toEqual(expect.objectContaining({ kind: 'image', gameId, imageCount: 1, apiKeyName: 'GOOGLE_API_KEY', inputTokens: 0, outputTokens: 0 }));
        });

        it('rolls a stale daily ledger to today instead of adding to yesterday', async () => {
            const { txn, userRef } = setupTransaction(null, {
                tier: 'free',
                dailySpend: { period: '2026-09-10', totalUSD: 4.99, buckets: { free: 4.99 }, limitHits: 3 }
            });

            await recordSpend({ userEmail, costUSD: 0.01, kind: 'preview', modelId: knownModelId }, T);

            expect(userWrite(txn, userRef).dailySpend).toEqual({ period: '2026-09-11', totalUSD: 0.01, buckets: { free: 0.01 }, limitHits: 0 });
        });

        it('paid tier: charges cost + markup off the balance and records the charged amount in both ledgers', async () => {
            const { txn, userRef } = setupTransaction(null, { tier: 'paid', balance: 10 });

            await recordSpend({ userEmail, costUSD: 1, kind: 'preview', modelId: knownModelId }, T);

            const user = userWrite(txn, userRef);
            const charged = parseFloat((1 * (1 + PAID_TIER_MARKUP)).toFixed(6));
            expect(user.balance).toBeCloseTo(10 - charged, 6);
            expect(user.spendings[0].paidAmountUSD).toBeCloseTo(charged, 6);
            expect(user.dailySpend.buckets.paid).toBeCloseTo(charged, 6);
        });

        it('paid tier with an insufficient balance: throws before any write', async () => {
            const { txn } = setupTransaction(null, { tier: 'paid', balance: 0.01 });

            await expect(recordSpend({ userEmail, costUSD: 1, kind: 'tts', modelId: 'gpt-4o-mini-tts' }, T))
                .rejects.toThrow('Insufficient balance');
            expect(txn.update).not.toHaveBeenCalled();
            expect(txn.set).not.toHaveBeenCalled();
        });

        it('zero cost with nothing to attribute to a game: no transaction at all', async () => {
            setupTransaction(null, { tier: 'free' });

            await recordSpend({ userEmail, costUSD: 0, kind: 'preview', modelId: knownModelId }, T);
            await recordSpend({ userEmail: undefined, costUSD: 0.5, kind: 'tts', modelId: 'whisper-1' }, T);

            expect(db!.runTransaction).not.toHaveBeenCalled();
        });

        it('still commits the money when the stats row cannot name a model', async () => {
            const { txn, userRef, statRef } = setupTransaction(null, { tier: 'free' });

            await recordSpend({ userEmail, costUSD: 0.5, kind: 'preview' }, T);

            expect(userWrite(txn, userRef).dailySpend.totalUSD).toBe(0.5);
            expect(statWrite(txn, statRef)).toBeUndefined();
        });

        it('refuses a gameUpdate without a gameId', async () => {
            await expect(recordSpend({ userEmail, costUSD: 0.5, kind: 'tts', gameUpdate: incrementGameCost(0.5) }, T))
                .rejects.toThrow('gameUpdate requires a gameId');
        });
    });

    describe('incrementGameCost', () => {
        it('adds to totalGameCost and any extra running-total fields, rounding to 6dp', () => {
            const update = incrementGameCost(0.2, ['totalImagesCost'])({ totalGameCost: 0.1, totalImagesCost: 0.05 } as any);
            expect(update).toEqual({ totalGameCost: 0.3, totalImagesCost: 0.25 });
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

describe('requestStats recording (per-request statistics doc)', () => {
    const gameId = 'game-1';
    const userEmail = 'player@example.com';

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('writes a stats doc for a bot call with model info derived from the game doc', async () => {
        const { txn, statRef } = setupTransaction({
            bots: [{ name: 'Bot1', aiType: 'qwen-max' }],
            totalGameCost: 0,
            createdWithTier: 'free'
        }, { tier: 'free' });

        await recordBotTokenUsage(gameId, 'Bot1', {
            inputTokens: 8000,
            outputTokens: 1100,
            totalTokens: 9100,
            costUSD: 0.02,
            reasoningTokens: 900,
            cachedInputTokens: 6000,
            durationMs: 25400
        }, userEmail);

        const stat = statWrite(txn, statRef);
        expect(stat).toMatchObject({
            gameId,
            userId: userEmail,
            tier: 'free',
            actor: 'bot',
            botName: 'Bot1',
            modelId: 'qwen-max',
            modelApiName: 'qwen3.8-max',
            apiKeyName: 'QWEN_API_KEY',
            thinkingEnabled: true,
            inputTokens: 8000,
            cachedInputTokens: 6000,
            outputTokens: 1100,
            reasoningTokens: 900,
            totalTokens: 9100,
            costUSD: 0.02,
            durationMs: 25400,
            status: 'ok'
        });
        expect(stat.createdAt).toBeInstanceOf(Date);
        expect(stat.expireAt.getTime()).toBeGreaterThan(stat.createdAt.getTime());
    });

    it('resolves deprecated model ids before recording', async () => {
        const { txn, statRef } = setupTransaction({
            bots: [{ name: 'OldBot', aiType: 'glm-thinking' }],
            totalGameCost: 0
        }, { tier: 'free' });

        await recordBotTokenUsage(gameId, 'OldBot', {
            inputTokens: 10, outputTokens: 5, totalTokens: 15, costUSD: 0.001
        }, userEmail);

        const stat = statWrite(txn, statRef);
        expect(stat.modelId).toBe('glm');
        expect(stat.modelApiName).toBe('glm-5.3');
        // Absent breakdowns are recorded as explicit zeros in the stats doc.
        expect(stat.cachedInputTokens).toBe(0);
        expect(stat.reasoningTokens).toBe(0);
        expect(stat.durationMs).toBe(0);
    });

    it('writes a GM stats doc keyed off gameMasterAiType', async () => {
        const { txn, statRef } = setupTransaction({
            gameMasterAiType: 'gpt',
            gameMasterTokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, costUSD: 0 },
            totalGameCost: 0
        }, { tier: 'paid', balance: 100 });

        await recordGameMasterTokenUsage(gameId, {
            inputTokens: 12000, outputTokens: 200, totalTokens: 12200, costUSD: 0.03, durationMs: 3600
        }, userEmail);

        const stat = statWrite(txn, statRef);
        expect(stat).toMatchObject({
            actor: 'gm',
            tier: 'paid',
            modelId: 'gpt',
            modelApiName: 'gpt-5.6-terra',
            apiKeyName: 'OPENAI_API_KEY',
            durationMs: 3600,
            status: 'ok'
        });
        expect(stat.botName).toBeUndefined();
    });

    it('does not write a stats doc when the bot is not in the game (no charge, no stat)', async () => {
        const { txn, statRef } = setupTransaction({
            bots: [{ name: 'SomeoneElse', aiType: 'glm' }],
            totalGameCost: 0
        }, { tier: 'free' });

        await recordBotTokenUsage(gameId, 'Ghost', {
            inputTokens: 10, outputTokens: 5, totalTokens: 15, costUSD: 0.001
        }, userEmail);

        expect(statWrite(txn, statRef)).toBeUndefined();
    });
});
