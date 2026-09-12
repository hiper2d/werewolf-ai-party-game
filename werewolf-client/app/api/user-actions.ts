'use server'

import {db} from "@/firebase/server";
import {firestore} from "firebase-admin";
import {FreeTierLimits, User, UserMonthlySpending, UserTier, USER_TIERS} from "@/app/api/game-models";
import {VoiceProvider, getDefaultVoiceProvider} from "@/app/ai/voice-config";
import {applyDailySpend, applySpending, formatPeriod, freeSpendVerdicts, normalizeSpendings} from "@/app/utils/spending-utils";
import {getFreeTierLimits} from "@/app/api/limits-actions";
import {FreeSpendLimitError} from "@/app/api/errors";
import {firstRefusal} from "@hiper2d/ai-agents";
import type {BudgetVerdict} from "@hiper2d/ai-agents";
import FieldValue = firestore.FieldValue;

const ZERO_SPENDINGS: UserMonthlySpending[] = [];

/**
 * Creates or updates the user's Firestore record on sign-in.
 * @returns true when the user did not exist before (i.e. this is their first sign-in).
 */
export async function upsertUser(user: any): Promise<boolean> {
    if (!db) {
        throw new Error('Firestore is not initialized');
    }

    const userRef = db.collection('users').doc(user.email);
    try {
        const doc = await userRef.get();

        if (!doc.exists) {
            await userRef.set({
                ...user,
                tier: 'free', // Default tier for new users
                created_at: FieldValue.serverTimestamp(),
                last_login_timestamp: FieldValue.serverTimestamp(),
                spendings: [...ZERO_SPENDINGS]
            });
            console.log(`New user created for ${user.name}`);
            return true;
        }

        const existingUser = doc.data() as User;
        const updatedUser = {
            ...existingUser,
            ...user,
            last_login_timestamp: FieldValue.serverTimestamp(),
            spendings: normalizeSpendings(existingUser.spendings)
        };
        await userRef.update(updatedUser);
        console.log(`Updated last_login_timestamp for existing user ${user.name}`);
        return false;
    } catch (error) {
        console.error("Error processing user:", error);
        return false;
    }
}

/**
 * NOT the way to bill a user. Every AI spend goes through `recordSpend`
 * (app/api/cost-tracking.ts), which charges, updates both ledgers and writes the
 * `requestStats` row in one transaction. This only bumps the user's ledgers and exists
 * for admin corrections and backfills; it writes no stats row, so anything recorded
 * through it is invisible to every cost report.
 */
export async function updateUserMonthlySpending(
    userId: string,
    amountUSD: number,
    tier?: UserTier,
    timestamp: number = Date.now()
): Promise<void> {
    if (!db) {
        throw new Error('Firestore is not initialized');
    }

    if (!userId) {
        throw new Error('User ID is required to track spendings');
    }

    const normalizedAmount = parseFloat(Number(amountUSD).toFixed(6));
    if (!(normalizedAmount > 0)) {
        // Ignore zero or negative amounts
        return;
    }

    const period = formatPeriod(timestamp);
    const userRef = db.collection('users').doc(userId);

    await db.runTransaction(async (transaction) => {
        const userSnap = await transaction.get(userRef);
        const currentData = userSnap.exists ? userSnap.data() : {};
        const updatedSpendings = applySpending(currentData?.spendings, period, normalizedAmount, tier);
        const updatedDaily = applyDailySpend(currentData?.dailySpend, timestamp, normalizedAmount, tier);

        if (userSnap.exists) {
            transaction.update(userRef, { spendings: updatedSpendings, dailySpend: updatedDaily });
        } else {
            transaction.set(userRef, { spendings: updatedSpendings, dailySpend: updatedDaily }, { merge: true });
        }
    });
}

export async function getUserTier(userId: string): Promise<UserTier> {
    if (!db) {
        throw new Error('Firestore is not initialized');
    }
    try {
        const userDoc = await db.collection('users').doc(userId).get();
        if (!userDoc.exists) {
            throw new Error('User not found');
        }
        const userData = userDoc.data();
        // Anything that isn't 'paid' — including stray legacy 'api' strings — reads as free.
        return userData?.tier === USER_TIERS.PAID ? USER_TIERS.PAID : USER_TIERS.FREE;
    } catch (error: any) {
        console.error("Error fetching user tier: ", error);
        throw new Error(`Failed to fetch user tier: ${error.message}`);
    }
}

export async function updateUserTier(userId: string, tier: UserTier): Promise<void> {
    if (!db) {
        throw new Error('Firestore is not initialized');
    }
    try {
        const userRef = db.collection('users').doc(userId);
        await userRef.update({
            tier: tier
        });
    } catch (error: any) {
        console.error("Error updating user tier: ", error);
        throw new Error(`Failed to update user tier: ${error.message}`);
    }
}

export async function getUser(userId: string): Promise<User> {
    if (!db) {
        throw new Error('Firestore is not initialized');
    }
    try {
        const userDoc = await db.collection('users').doc(userId).get();
        if (!userDoc.exists) {
            throw new Error('User not found');
        }
        const userData = userDoc.data();
        // Ensure tier and voiceProvider fields exist for backward compatibility
        return {
            name: userData?.name || '',
            email: userData?.email || userId,
            tier: userData?.tier === USER_TIERS.PAID ? USER_TIERS.PAID : USER_TIERS.FREE,
            spendings: normalizeSpendings(userData?.spendings),
            ...(userData?.dailySpend ? { dailySpend: userData.dailySpend } : {}),
            voiceProvider: userData?.voiceProvider || getDefaultVoiceProvider(),
            balance: userData?.balance || 0,
            stripeCustomerId: userData?.stripeCustomerId
        } as User;
    } catch (error: any) {
        console.error("Error fetching user: ", error);
        throw new Error(`Failed to fetch user: ${error.message}`);
    }
}

export async function getVoiceProvider(userId: string): Promise<VoiceProvider> {
    if (!db) {
        throw new Error('Firestore is not initialized');
    }
    try {
        const userDoc = await db.collection('users').doc(userId).get();
        if (!userDoc.exists) {
            return getDefaultVoiceProvider();
        }
        const user = userDoc.data() as User;
        return user?.voiceProvider || getDefaultVoiceProvider();
    } catch (error: any) {
        console.error("Error fetching voice provider: ", error);
        throw new Error(`Failed to fetch voice provider: ${error.message}`);
    }
}

export async function updateVoiceProvider(userId: string, provider: VoiceProvider): Promise<void> {
    if (!db) {
        throw new Error('Firestore is not initialized');
    }
    try {
        const userRef = db.collection('users').doc(userId);
        await userRef.update({
            voiceProvider: provider
        });
    } catch (error: any) {
        console.error("Error updating voice provider: ", error);
        throw new Error(`Failed to update voice provider: ${error.message}`);
    }
}

export async function getUserBalance(userId: string): Promise<number> {
    if (!db) {
        throw new Error('Firestore is not initialized');
    }
    try {
        const userDoc = await db.collection('users').doc(userId).get();
        if (!userDoc.exists) {
            return 0;
        }
        const userData = userDoc.data();
        return userData?.balance || 0;
    } catch (error: any) {
        console.error("Error fetching user balance: ", error);
        throw new Error(`Failed to fetch user balance: ${error.message}`);
    }
}

export async function addBalance(userId: string, amountUSD: number): Promise<void> {
    if (!db) {
        throw new Error('Firestore is not initialized');
    }
    if (amountUSD <= 0) {
        throw new Error('Amount must be positive');
    }

    const userRef = db.collection('users').doc(userId);
    await db.runTransaction(async (transaction) => {
        const userSnap = await transaction.get(userRef);
        if (!userSnap.exists) {
            throw new Error('User not found');
        }
        const data = userSnap.data();
        const currentBalance = data?.balance || 0;
        const newBalance = parseFloat((currentBalance + amountUSD).toFixed(6));
        const update: { balance: number; tier?: UserTier } = { balance: newBalance };
        // Adding funds is an explicit opt-in to paid usage. Without this a free-tier
        // top-up only raises the balance while the user keeps playing under free-tier
        // rules.
        if ((data?.tier || 'free') !== USER_TIERS.PAID) {
            update.tier = USER_TIERS.PAID;
        }
        transaction.update(userRef, update);
    });
}

/**
 * The free-tier spend guard. Refuses — by throwing FreeSpendLimitError — when the user's
 * free-tier (platform-key) spend has reached the daily or the monthly cap from
 * `config/limits` / FREE_TIER_LIMITS. Applies to EVERY spending path with no exceptions
 * (bot and GM turns via the agent pre-ask hook in agent-factory.ts; previews, images and
 * voice call it directly), so a running game stops at its next AI turn and resumes when
 * the window resets. Paid tier is exempt: its prepaid balance is the limit.
 *
 * Gates on the user's CURRENT tier, not the game's creation tier. Runs before the AI
 * call, so it can only see spend already committed; parallel calls that each pass can
 * overrun the cap by the calls in flight — cents, not dollars — and that spend is still
 * recorded (recordSpend never refuses money that was spent).
 *
 * A refusal bumps `dailySpend.limitHits`: the only record that a user was turned away.
 */
export async function assertFreeSpendWithinLimit(userId: string, timestamp: number = Date.now()): Promise<void> {
    if (!db) {
        throw new Error('Firestore is not initialized');
    }
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
        return;
    }
    const userData = userDoc.data() || {};
    if (userData.tier === USER_TIERS.PAID) {
        return;
    }
    const limits = await getFreeTierLimits();
    const refused = firstRefusal(freeSpendVerdicts(userData, limits, timestamp));
    if (!refused) {
        return;
    }
    // Count the refusal on today's ledger (rolling it to today first if it is stale).
    // Best effort: a failed counter write must not turn a refusal into a different error.
    const todayLedger = applyDailySpend(userData.dailySpend, timestamp, 0, USER_TIERS.FREE);
    const counted = { ...todayLedger, limitHits: (todayLedger.limitHits ?? 0) + 1 };
    try {
        await userRef.set({ dailySpend: counted }, { merge: true });
    } catch (error: any) {
        console.error(`FREE_SPEND_LIMIT: could not record limit hit for ${userId}: ${error?.message ?? error}`);
    }
    // Expected behaviour, not an incident: warn with a fixed tag, never error.
    console.warn(`FREE_SPEND_LIMIT: refused ${userId} — ${refused.window} cap $${refused.limitUSD} reached ($${refused.spentUSD} spent, hit #${counted.limitHits}, resets ${new Date(refused.resetsAt).toISOString()})`);
    throw new FreeSpendLimitError(refused);
}

/**
 * The free-tier budget picture for the profile page: both verdicts (day, month) plus
 * the limits they were judged against. Paid users get the verdicts too (they are
 * informational there); a missing user doc reads as nothing spent.
 */
export async function getFreeSpendStatus(userId: string, timestamp: number = Date.now()): Promise<{
    limits: FreeTierLimits;
    day: BudgetVerdict;
    month: BudgetVerdict;
}> {
    if (!db) {
        throw new Error('Firestore is not initialized');
    }
    const userDoc = await db.collection('users').doc(userId).get();
    const limits = await getFreeTierLimits();
    const [day, month] = freeSpendVerdicts(userDoc.exists ? userDoc.data() : undefined, limits, timestamp);
    return { limits, day, month };
}

export async function deductBalance(userId: string, amountUSD: number): Promise<boolean> {
    if (!db) {
        throw new Error('Firestore is not initialized');
    }
    if (amountUSD <= 0) {
        return true;
    }

    const userRef = db.collection('users').doc(userId);
    let success = false;

    await db.runTransaction(async (transaction) => {
        const userSnap = await transaction.get(userRef);
        if (!userSnap.exists) {
            return;
        }
        const currentBalance = userSnap.data()?.balance || 0;
        if (currentBalance < amountUSD) {
            return;
        }
        // 6dp to match charge amounts — 2dp rounding silently swallowed every
        // sub-cent charge (TTS clicks, single bot calls), so paid usage was free
        const newBalance = parseFloat((currentBalance - amountUSD).toFixed(6));
        transaction.update(userRef, { balance: newBalance });
        success = true;
    });

    return success;
}

export async function setStripeCustomerId(userId: string, stripeCustomerId: string): Promise<void> {
    if (!db) {
        throw new Error('Firestore is not initialized');
    }
    const userRef = db.collection('users').doc(userId);
    await userRef.update({ stripeCustomerId });
}
