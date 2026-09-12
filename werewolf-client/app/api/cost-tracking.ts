import {db} from "@/firebase/server";
import {Game, TokenUsage, UserTier, USER_TIERS} from "@/app/api/game-models";
import {SupportedAiModels, resolveModelId} from "@/app/ai/ai-models";
import {PAID_TIER_MARKUP} from "@/app/config/credit-packages";
import {applyDailySpend, applySpending, formatPeriod} from "@/app/utils/spending-utils";
import {logger} from "@/app/utils/logger";

type TokenUsageInput = Partial<TokenUsage> | null | undefined;

function round6(n: number): number {
    return parseFloat((Number(n) || 0).toFixed(6));
}

function normalizeTokenUsage(usage: TokenUsageInput): TokenUsage {
    const inputTokens = Number(usage?.inputTokens) || 0;
    const outputTokens = Number(usage?.outputTokens) || 0;
    const suppliedTotal = Number(usage?.totalTokens) || 0;
    const computedTotal = inputTokens + outputTokens;
    const totalTokens = suppliedTotal > 0 ? suppliedTotal : computedTotal;
    const costUSD = round6(Number(usage?.costUSD) || 0);
    const reasoningTokens = Number(usage?.reasoningTokens) || 0;
    const cachedInputTokens = Number(usage?.cachedInputTokens) || 0;
    const durationMs = Number(usage?.durationMs) || 0;

    return {
        inputTokens,
        outputTokens,
        totalTokens,
        costUSD,
        // Kept out of the object unless the model actually reasoned: Firestore rejects
        // undefined, and a 0 on every non-reasoning model is just noise.
        ...(reasoningTokens > 0 ? { reasoningTokens } : {}),
        ...(cachedInputTokens > 0 ? { cachedInputTokens } : {}),
        ...(durationMs > 0 ? { durationMs } : {})
    };
}

/**
 * Where the money went. `bot` / `gm` are game LLM turns (they also carry the legacy
 * `actor` field on their stats row); the rest are the paths that used to bill ad hoc.
 */
export type SpendKind = 'bot' | 'gm' | 'preview' | 'image' | 'tts' | 'stt';

// Per-request statistics: one doc per AI call in the top-level `requestStats` collection,
// written inside the same transaction as billing so stats and money can never disagree.
// Raw provider-reported numbers only — derived values (uncached input, visible output,
// effective multiplier) are computed at read time by scripts/request-stats-report.ts.
// `expireAt` enables a Firestore TTL policy later without a migration.
const REQUEST_STATS_TTL_MS = 180 * 24 * 60 * 60 * 1000; // 180 days

export interface RecordSpendInput {
    userEmail: string | undefined;
    /** Raw provider cost. Paid tier is charged this plus PAID_TIER_MARKUP. */
    costUSD: number;
    kind: SpendKind;
    /** Attributes the stats row to a game; required when `gameUpdate` is given. Absent for previews and drafts. */
    gameId?: string;
    /** Model for the stats row. `bot` / `gm` resolve it from the game doc instead. */
    modelId?: string;
    /** Provider key name for the stats row when the model is not in SupportedAiModels (images, voice). */
    apiKeyName?: string;
    botName?: string;
    /** Token counts when the call had them. Its `costUSD` is ignored in favour of `costUSD` above. */
    usage?: TokenUsageInput;
    /** Image calls bill per image, not per token. */
    imageCount?: number;
    /**
     * Inspects the freshly-read game doc and returns the field map to write in the same
     * transaction, or `null` to abort cleanly (game missing / bot not found) without
     * charging anything.
     */
    gameUpdate?: (game: Game) => Record<string, any> | null;
}

/** A `gameUpdate` that adds the cost to the game's running total and nothing else. */
export function incrementGameCost(costUSD: number, extraFields: string[] = []): (game: Game) => Record<string, any> {
    return (game) => {
        const update: Record<string, any> = {
            totalGameCost: round6((Number(game.totalGameCost) || 0) + costUSD)
        };
        for (const field of extraFields) {
            update[field] = round6((Number((game as any)[field]) || 0) + costUSD);
        }
        return update;
    };
}

function buildRequestStatDoc(
    input: RecordSpendInput,
    game: Game | undefined,
    tier: UserTier,
    usage: TokenUsage,
    timestamp: number
): Record<string, any> | null {
    let modelId: string | undefined;
    if (input.kind === 'gm' || input.kind === 'bot') {
        const rawModelId = input.kind === 'gm'
            ? game?.gameMasterAiType
            : (Array.isArray(game?.bots) ? game!.bots.find(b => b.name === input.botName)?.aiType : undefined);
        modelId = rawModelId ? resolveModelId(rawModelId) : undefined;
    } else if (input.modelId) {
        modelId = resolveModelId(input.modelId);
    }
    if (!modelId) {
        return null;
    }
    const config = SupportedAiModels[modelId];
    const isGameTurn = input.kind === 'gm' || input.kind === 'bot';

    return {
        ...(input.gameId ? { gameId: input.gameId } : {}),
        ...(input.userEmail ? { userId: input.userEmail } : {}),
        tier,
        kind: input.kind,
        // Kept on game turns so existing readers that filter by actor keep meaning what
        // they meant; non-game rows have only `kind`.
        ...(isGameTurn ? { actor: input.kind } : {}),
        ...(input.botName ? { botName: input.botName } : {}),
        ...(typeof (game as any)?.currentDay === 'number' ? { day: (game as any).currentDay } : {}),
        modelId,
        modelApiName: config?.modelApiName ?? modelId,
        apiKeyName: input.apiKeyName ?? config?.apiKeyName ?? 'unknown',
        thinkingEnabled: config?.hasThinking ?? false,
        inputTokens: usage.inputTokens,
        cachedInputTokens: usage.cachedInputTokens ?? 0,
        outputTokens: usage.outputTokens,
        reasoningTokens: usage.reasoningTokens ?? 0,
        totalTokens: usage.totalTokens,
        costUSD: usage.costUSD,
        ...(input.imageCount ? { imageCount: input.imageCount } : {}),
        durationMs: usage.durationMs ?? 0,
        status: 'ok',
        createdAt: new Date(timestamp),
        expireAt: new Date(timestamp + REQUEST_STATS_TTL_MS)
    };
}

/**
 * THE place that moves money. Every AI spend in the app — bot and GM turns, previews,
 * images, voice — goes through here, in ONE Firestore transaction:
 *
 * 1. Charge the user off their CURRENT tier (read in the transaction, so an upgrade to
 *    paid bills even games created on the free tier). Paid tier pays cost + markup from
 *    the prepaid balance and an insufficient balance throws BEFORE any write, so we
 *    never record a cost we didn't charge. Free tier only records.
 * 2. Add the amount to the user's monthly `spendings` bucket and to the daily ledger
 *    (`dailySpend`), the two records the free-tier caps read.
 * 3. Write one `requestStats` row carrying `kind`, so every dollar shows up in reports.
 * 4. Apply `gameUpdate` to the game doc when there is one.
 *
 * Because all of that commits together (or not at all) there is no charge-without-commit
 * or commit-without-charge window, and no path that spends without a stats row — the
 * bug that made two thirds of image/preview spend invisible before this existed.
 *
 * Spend that already happened is always recorded, even when it lands past a cap: the
 * caps are enforced BEFORE the call by assertFreeSpendWithinLimit (user-actions) and the
 * agent pre-ask hook (agent-factory); refusing to record here would only hide money.
 */
export async function recordSpend(input: RecordSpendInput, timestamp: number = Date.now()): Promise<void> {
    if (!db) {
        return;
    }
    if (input.gameUpdate && !input.gameId) {
        throw new Error('recordSpend: gameUpdate requires a gameId');
    }

    const costUSD = round6(input.costUSD);
    const usage = normalizeTokenUsage({ ...(input.usage ?? {}), costUSD });
    const gameRef = input.gameId ? db.collection('games').doc(input.gameId) : null;
    const userRef = input.userEmail ? db.collection('users').doc(input.userEmail) : null;
    const shouldCharge = !!userRef && costUSD > 0;
    // Game turns read the game for the model on the stats row even at zero cost.
    const needsGame = !!gameRef && (!!input.gameUpdate || input.kind === 'bot' || input.kind === 'gm');
    if (!shouldCharge && !needsGame) {
        return;
    }
    // Pre-allocated so the write can join the transaction (refs can't be created inside).
    const statRef = db.collection('requestStats').doc();

    await db.runTransaction(async (transaction) => {
        // ---- all reads first (Firestore requires reads before writes) ----
        let game: Game | undefined;
        let gameUpdate: Record<string, any> | null = null;
        if (needsGame) {
            const gameSnap = await transaction.get(gameRef!);
            if (!gameSnap.exists) {
                return;
            }
            game = gameSnap.data() as Game;
            if (input.gameUpdate) {
                // Pure computation; returns null to abort without charging.
                gameUpdate = input.gameUpdate(game);
                if (!gameUpdate) {
                    return;
                }
            }
        }

        const userSnap = shouldCharge ? await transaction.get(userRef!) : null;

        // The tier that actually billed: the user's current tier when charging, the game's
        // creation tier otherwise (zero-cost calls, platform-key games with no user email).
        // Coerced, not cast: a stray legacy tier string (e.g. the retired 'api') must bill
        // as free — otherwise its spend would land in no bucket at all.
        const rawTier = userSnap ? userSnap.data()?.tier : game?.createdWithTier;
        const billedTier: UserTier = rawTier === USER_TIERS.PAID ? USER_TIERS.PAID : USER_TIERS.FREE;

        // ---- charge the user (writes deferred until after all reads) ----
        if (userSnap) {
            const userData = userSnap.data() || {};
            const tier = billedTier;

            let recordedAmount = costUSD;
            const userUpdate: Record<string, any> = {};

            if (tier === USER_TIERS.PAID) {
                // Paid tier pays model cost + markup; record what was actually billed.
                const chargedAmount = round6(costUSD * (1 + PAID_TIER_MARKUP));
                const balance = Number(userData.balance) || 0;
                if (balance < chargedAmount) {
                    throw new Error('Insufficient balance. Please add funds on your profile page to continue playing.');
                }
                userUpdate.balance = round6(balance - chargedAmount);
                recordedAmount = chargedAmount;
            }

            userUpdate.spendings = applySpending(userData.spendings, formatPeriod(timestamp), recordedAmount, tier);
            userUpdate.dailySpend = applyDailySpend(userData.dailySpend, timestamp, recordedAmount, tier);

            if (userSnap.exists) {
                transaction.update(userRef!, userUpdate);
            } else {
                transaction.set(userRef!, userUpdate, { merge: true });
            }
        }

        // ---- commit the game cost ----
        if (gameUpdate) {
            transaction.update(gameRef!, gameUpdate);
        }

        // ---- record per-request statistics (same transaction as the money) ----
        const statDoc = buildRequestStatDoc(input, game, billedTier, usage, timestamp);
        if (statDoc) {
            transaction.set(statRef, statDoc);
        } else {
            // The money still commits; a row that can't be attributed is a reporting gap,
            // never a reason to lose the charge.
            logger.error('requestStats row skipped: could not resolve a model for the spend', {
                kind: input.kind, gameId: input.gameId, botName: input.botName, modelId: input.modelId, costUSD
            });
        }
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

    await recordSpend({
        userEmail,
        costUSD: usage.costUSD,
        kind: 'gm',
        gameId,
        usage,
        gameUpdate: (game) => {
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
                costUSD: round6((currentUsage.costUSD || 0) + usage.costUSD),
                ...(reasoningTokens > 0 ? { reasoningTokens } : {})
            };

            return {
                gameMasterTokenUsage: updatedUsage,
                totalGameCost: round6((game.totalGameCost || 0) + usage.costUSD)
            };
        }
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

    await recordSpend({
        userEmail,
        costUSD: usage.costUSD,
        kind: 'bot',
        gameId,
        botName,
        usage,
        gameUpdate: (game) => {
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
                        costUSD: round6((currentUsage.costUSD || 0) + usage.costUSD),
                        ...(reasoningTokens > 0 ? { reasoningTokens } : {})
                    }
                };
            });

            // Bot not in the game — abort without charging.
            if (!botFound) {
                return null;
            }

            return {
                bots: updatedBots,
                totalGameCost: round6((game.totalGameCost || 0) + usage.costUSD)
            };
        }
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
