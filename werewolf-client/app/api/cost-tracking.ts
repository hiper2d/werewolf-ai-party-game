import {db} from "@/firebase/server";
import {Game, TokenUsage, UserTier, USER_TIERS} from "@/app/api/game-models";
import {updateUserMonthlySpending, deductBalance} from "@/app/api/user-actions";
import {PAID_TIER_MARKUP} from "@/app/config/credit-packages";

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

    // For paid tier, deduct model cost + markup from user balance
    if (tier === USER_TIERS.PAID) {
        const chargedAmount = parseFloat((amountUSD * (1 + PAID_TIER_MARKUP)).toFixed(6));
        const success = await deductBalance(userEmail, chargedAmount);
        if (!success) {
            throw new Error('Insufficient balance. Please add funds on your profile page to continue playing.');
        }
        // Record what the user was actually billed (cost + markup), not the raw
        // model cost — otherwise the paid-tier spending history understates billing.
        await updateUserMonthlySpending(userEmail, chargedAmount, tier);
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

    // Read the tier up front so we can charge the user BEFORE committing the game
    // cost. Charging first means an insufficient balance throws here and nothing
    // is persisted — eliminating the cost-recorded-but-never-charged window. The
    // only residual gap is the rare charge-succeeds-then-commit-fails case, which
    // costs the platform nothing (the user paid; we just under-record our own cost).
    const preSnap = await gameRef.get();
    if (!preSnap.exists) {
        return;
    }
    const gameTier = (preSnap.data() as Game).createdWithTier;

    await applyUserSpending(userEmail, usage.costUSD, gameTier);

    await db.runTransaction(async (transaction) => {
        const gameSnap = await transaction.get(gameRef);
        if (!gameSnap.exists) {
            return;
        }

        const game = gameSnap.data() as Game;
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
    });
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

    // Read the tier (and confirm the bot exists) up front so we can charge the
    // user BEFORE committing the game cost — see recordGameMasterTokenUsage for
    // the rationale. We skip charging entirely if the bot isn't in the game.
    const preSnap = await gameRef.get();
    if (!preSnap.exists) {
        return;
    }
    const preGame = preSnap.data() as Game;
    const gameTier = preGame.createdWithTier;
    const botExists = (Array.isArray(preGame.bots) ? preGame.bots : []).some(bot => bot.name === botName);
    if (!botExists) {
        return;
    }

    await applyUserSpending(userEmail, usage.costUSD, gameTier);

    await db.runTransaction(async (transaction) => {
        const gameSnap = await transaction.get(gameRef);
        if (!gameSnap.exists) {
            return;
        }

        const game = gameSnap.data() as Game;
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
    });
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
