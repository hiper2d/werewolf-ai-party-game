import {db} from "@/firebase/server";
import {Game, TokenUsage, UserTier, USER_TIERS} from "@/app/api/game-models";
import {PAID_TIER_MARKUP} from "@/app/config/credit-packages";
import {applySpending, formatPeriod} from "@/app/utils/spending-utils";

type TokenUsageInput = Partial<TokenUsage> | null | undefined;

function normalizeTokenUsage(usage: TokenUsageInput): TokenUsage {
    const inputTokens = Number(usage?.inputTokens) || 0;
    const outputTokens = Number(usage?.outputTokens) || 0;
    const suppliedTotal = Number(usage?.totalTokens) || 0;
    const computedTotal = inputTokens + outputTokens;
    const totalTokens = suppliedTotal > 0 ? suppliedTotal : computedTotal;
    const costUSD = parseFloat((Number(usage?.costUSD) || 0).toFixed(6));
    const reasoningTokens = Number(usage?.reasoningTokens) || 0;

    return {
        inputTokens,
        outputTokens,
        totalTokens,
        costUSD,
        // Kept out of the object unless the model actually reasoned: Firestore rejects
        // undefined, and a 0 on every non-reasoning model is just noise.
        ...(reasoningTokens > 0 ? { reasoningTokens } : {})
    };
}

/**
 * Charge the user AND commit the game cost in a SINGLE Firestore transaction.
 *
 * `buildGameUpdate` inspects the freshly-read game doc and returns the field map
 * to write, or `null` to abort cleanly (game missing / bot not found) without
 * charging anything.
 *
 * Doing both writes in one transaction closes the last money-consistency gap:
 * - Charging keys off the user's CURRENT tier read in the same transaction (#8),
 *   so an upgrade-to-paid bills even games created on the free tier.
 * - For paid tier an insufficient balance throws BEFORE any write, so we never
 *   record a cost we didn't charge.
 * - Because the balance deduction, the monthly-spending record and the game cost
 *   all commit together (or not at all), there is no charge-without-commit or
 *   commit-without-charge window, and the user doc itself can't end up with a
 *   deducted balance but no matching spending entry.
 */
async function commitUsageAtomically(
    gameId: string,
    userEmail: string | undefined,
    costUSD: number,
    buildGameUpdate: (game: Game) => Record<string, any> | null,
    timestamp: number = Date.now()
): Promise<void> {
    if (!db) {
        return;
    }

    const gameRef = db.collection('games').doc(gameId);
    const userRef = userEmail ? db.collection('users').doc(userEmail) : null;
    const shouldCharge = !!userRef && costUSD > 0;

    await db.runTransaction(async (transaction) => {
        // ---- all reads first (Firestore requires reads before writes) ----
        const gameSnap = await transaction.get(gameRef);
        if (!gameSnap.exists) {
            return;
        }
        const game = gameSnap.data() as Game;

        // Pure computation; returns null to abort without charging.
        const gameUpdate = buildGameUpdate(game);
        if (!gameUpdate) {
            return;
        }

        const userSnap = shouldCharge ? await transaction.get(userRef!) : null;

        // ---- charge the user (writes deferred until after all reads) ----
        if (userSnap) {
            const userData = userSnap.data() || {};
            const tier = (userData.tier as UserTier) || USER_TIERS.FREE;

            let recordedAmount = costUSD;
            const userUpdate: Record<string, any> = {};

            if (tier === USER_TIERS.PAID) {
                // Paid tier pays model cost + markup; record what was actually billed.
                const chargedAmount = parseFloat((costUSD * (1 + PAID_TIER_MARKUP)).toFixed(6));
                const balance = Number(userData.balance) || 0;
                if (balance < chargedAmount) {
                    throw new Error('Insufficient balance. Please add funds on your profile page to continue playing.');
                }
                userUpdate.balance = parseFloat((balance - chargedAmount).toFixed(6));
                recordedAmount = chargedAmount;
            }

            userUpdate.spendings = applySpending(userData.spendings, formatPeriod(timestamp), recordedAmount, tier);

            if (userSnap.exists) {
                transaction.update(userRef!, userUpdate);
            } else {
                transaction.set(userRef!, userUpdate, { merge: true });
            }
        }

        // ---- commit the game cost ----
        transaction.update(gameRef, gameUpdate);
    });
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

    await commitUsageAtomically(gameId, userEmail, usage.costUSD, (game) => {
        const currentUsage = game.gameMasterTokenUsage || {
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            costUSD: 0
        };

        const reasoningTokens = (currentUsage.reasoningTokens || 0) + (usage.reasoningTokens || 0);

        const updatedUsage: TokenUsage = {
            inputTokens: currentUsage.inputTokens + usage.inputTokens,
            outputTokens: currentUsage.outputTokens + usage.outputTokens,
            totalTokens: currentUsage.totalTokens + usage.totalTokens,
            costUSD: parseFloat(((currentUsage.costUSD || 0) + usage.costUSD).toFixed(6)),
            ...(reasoningTokens > 0 ? { reasoningTokens } : {})
        };

        const updatedTotalCost = parseFloat(((game.totalGameCost || 0) + usage.costUSD).toFixed(6));

        return {
            gameMasterTokenUsage: updatedUsage,
            totalGameCost: updatedTotalCost
        };
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

    await commitUsageAtomically(gameId, userEmail, usage.costUSD, (game) => {
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

            const reasoningTokens = (currentUsage.reasoningTokens || 0) + (usage.reasoningTokens || 0);

            return {
                ...bot,
                tokenUsage: {
                    inputTokens: currentUsage.inputTokens + usage.inputTokens,
                    outputTokens: currentUsage.outputTokens + usage.outputTokens,
                    totalTokens: currentUsage.totalTokens + usage.totalTokens,
                    costUSD: parseFloat(((currentUsage.costUSD || 0) + usage.costUSD).toFixed(6)),
                    ...(reasoningTokens > 0 ? { reasoningTokens } : {})
                }
            };
        });

        // Bot not in the game — abort without charging.
        if (!botFound) {
            return null;
        }

        const updatedTotalCost = parseFloat(((game.totalGameCost || 0) + usage.costUSD).toFixed(6));

        return {
            bots: updatedBots,
            totalGameCost: updatedTotalCost
        };
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
