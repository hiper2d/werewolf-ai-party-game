import {db} from "@/firebase/server";
import {Game, TokenUsage, UserTier} from "@/app/api/game-models";
import {updateUserMonthlySpending} from "@/app/api/user-actions";

type TokenUsageInput = Partial<TokenUsage> | null | undefined;

function normalizeTokenUsage(usage: TokenUsageInput): TokenUsage {
    const inputTokens = Number(usage?.inputTokens) || 0;
    const outputTokens = Number(usage?.outputTokens) || 0;
    const suppliedTotal = Number(usage?.totalTokens) || 0;
    const computedTotal = inputTokens + outputTokens;
    const totalTokens = suppliedTotal > 0 ? suppliedTotal : computedTotal;
    const costUSD = parseFloat((Number(usage?.costUSD) || 0).toFixed(6));

    return {
        inputTokens,
        outputTokens,
        totalTokens,
        costUSD
    };
}

async function applyUserSpending(
    userEmail: string | undefined,
    amountUSD: number,
    tier?: UserTier
): Promise<void> {
    if (!userEmail) {
        return;
    }
    if (!(amountUSD > 0)) {
        return;
    }

    await updateUserMonthlySpending(userEmail, amountUSD, tier);
}

export async function recordGameMasterTokenUsage(
    gameId: string,
    tokenUsage: TokenUsageInput,
    userEmail: string | undefined
): Promise<void> {
    if (!db || !tokenUsage) {
        return;
    }

    const usage = normalizeTokenUsage(tokenUsage);
    const gameRef = db.collection('games').doc(gameId);
    let usageApplied = false;
    let gameTier: UserTier | undefined;

    await db.runTransaction(async (transaction) => {
        const gameSnap = await transaction.get(gameRef);
        if (!gameSnap.exists) {
            return;
        }

        const game = gameSnap.data() as Game;
        gameTier = game.createdWithTier;
        const currentUsage = game.gameMasterTokenUsage || {
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            costUSD: 0
        };

        const updatedUsage: TokenUsage = {
            inputTokens: currentUsage.inputTokens + usage.inputTokens,
            outputTokens: currentUsage.outputTokens + usage.outputTokens,
            totalTokens: currentUsage.totalTokens + usage.totalTokens,
            costUSD: parseFloat(((currentUsage.costUSD || 0) + usage.costUSD).toFixed(6))
        };

        const updatedTotalCost = parseFloat(((game.totalGameCost || 0) + usage.costUSD).toFixed(6));

        transaction.update(gameRef, {
            gameMasterTokenUsage: updatedUsage,
            totalGameCost: updatedTotalCost
        });

        usageApplied = true;
    });

    if (usageApplied) {
        await applyUserSpending(userEmail, usage.costUSD, gameTier);
    }
}

export async function recordBotTokenUsage(
    gameId: string,
    botName: string,
    tokenUsage: TokenUsageInput,
    userEmail: string | undefined
): Promise<void> {
    if (!db || !tokenUsage) {
        return;
    }

    const usage = normalizeTokenUsage(tokenUsage);
    const gameRef = db.collection('games').doc(gameId);

    let usageApplied = false;
    let gameTier: UserTier | undefined;

    await db.runTransaction(async (transaction) => {
        const gameSnap = await transaction.get(gameRef);
        if (!gameSnap.exists) {
            return;
        }

        const game = gameSnap.data() as Game;
        gameTier = game.createdWithTier;
        const bots = Array.isArray(game.bots) ? game.bots : [];
        let botFound = false;

        const updatedBots = bots.map(bot => {
            if (bot.name !== botName) {
                return bot;
            }

            botFound = true;
            const currentUsage = bot.tokenUsage || {
                inputTokens: 0,
                outputTokens: 0,
                totalTokens: 0,
                costUSD: 0
            };

            return {
                ...bot,
                tokenUsage: {
                    inputTokens: currentUsage.inputTokens + usage.inputTokens,
                    outputTokens: currentUsage.outputTokens + usage.outputTokens,
                    totalTokens: currentUsage.totalTokens + usage.totalTokens,
                    costUSD: parseFloat(((currentUsage.costUSD || 0) + usage.costUSD).toFixed(6))
                }
            };
        });

        if (!botFound) {
            return;
        }

        const updatedTotalCost = parseFloat(((game.totalGameCost || 0) + usage.costUSD).toFixed(6));

        transaction.update(gameRef, {
            bots: updatedBots,
            totalGameCost: updatedTotalCost
        });

        usageApplied = true;
    });

    if (usageApplied) {
        await applyUserSpending(userEmail, usage.costUSD, gameTier);
    }
}

/**
 * Get the tier a game was created with.
 * Useful for tracking spending by tier when gameId is known.
 */
export async function getGameTier(gameId: string | undefined): Promise<UserTier | undefined> {
    if (!db || !gameId) {
        return undefined;
    }

    try {
        const gameSnap = await db.collection('games').doc(gameId).get();
        if (!gameSnap.exists) {
            return undefined;
        }
        const game = gameSnap.data() as Game;
        return game.createdWithTier;
    } catch (error) {
        console.error('Error getting game tier:', error);
        return undefined;
    }
}

export async function recordGameCost(gameId: string | undefined, amountUSD: number): Promise<void> {
    if (!db || !gameId) {
        return;
    }

    const normalizedAmount = parseFloat((Number(amountUSD) || 0).toFixed(6));
    if (!(normalizedAmount > 0)) {
        return;
    }

    const gameRef = db.collection('games').doc(gameId);

    await db.runTransaction(async (transaction) => {
        const gameSnap = await transaction.get(gameRef);
        if (!gameSnap.exists) {
            return;
        }

        const currentData = gameSnap.data() as Game;
        const currentTotal = Number(currentData?.totalGameCost) || 0;
        const updatedTotal = parseFloat((currentTotal + normalizedAmount).toFixed(6));

        transaction.update(gameRef, {
            totalGameCost: updatedTotal
        });
    });
}
