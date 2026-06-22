'use server'

import {db} from "@/firebase/server";
import {firestore} from "firebase-admin";
import {ApiKeyMap, FREE_TIER_LIMITS, User, UserMonthlySpending, UserTier, USER_TIERS} from "@/app/api/game-models";
import {VoiceProvider, getDefaultVoiceProvider} from "@/app/ai/voice-config";
import {applySpending, formatPeriod, getFreeSpendForPeriod, normalizeSpendings} from "@/app/utils/spending-utils";
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
            apiKeys: {
                ...existingUser.apiKeys,
                ...user.apiKeys
            },
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

export async function getUserApiKeys(userId: string): Promise<ApiKeyMap> {
    if (!db) {
        throw new Error('Firestore is not initialized');
    }
    try {
        const userDoc = await db.collection('users').doc(userId).get();
        if (!userDoc.exists) {
            throw new Error('User not found');
        }
        const user = userDoc.data() as User;
        return user?.apiKeys || {};
    } catch (error: any) {
        console.error("Error fetching API keys: ", error);
        throw new Error(`Failed to fetch API keys: ${error.message}`);
    }
}

export async function addApiKey(userId: string, model: string, value: string): Promise<void> {
    if (!db) {
        throw new Error('Firestore is not initialized');
    }
    try {
        const userRef = db.collection('users').doc(userId);
        await userRef.update({
            [`apiKeys.${model}`]: value
        });
    } catch (error: any) {
        console.error("Error adding API key: ", error);
        throw new Error(`Failed to add API key: ${error.message}`);
    }
}

export async function updateApiKey(userId: string, model: string, newValue: string): Promise<void> {
    if (!db) {
        throw new Error('Firestore is not initialized');
    }
    try {
        const userRef = db.collection('users').doc(userId);
        await userRef.update({
            [`apiKeys.${model}`]: newValue
        });
    } catch (error: any) {
        console.error("Error updating API key: ", error);
        throw new Error(`Failed to update API key: ${error.message}`);
    }
}

export async function deleteApiKey(userId: string, model: string): Promise<void> {
    if (!db) {
        throw new Error('Firestore is not initialized');
    }
    try {
        const userRef = db.collection('users').doc(userId);
        await userRef.update({
            [`apiKeys.${model}`]: FieldValue.delete()
        });
    } catch (error: any) {
        console.error("Error deleting API key: ", error);
        throw new Error(`Failed to delete API key: ${error.message}`);
    }
}

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

        if (userSnap.exists) {
            transaction.update(userRef, { spendings: updatedSpendings });
        } else {
            transaction.set(userRef, { spendings: updatedSpendings }, { merge: true });
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
        const user = userDoc.data() as User;
        return user?.tier || 'free';
    } catch (error: any) {
        console.error("Error fetching user tier: ", error);
        throw new Error(`Failed to fetch user tier: ${error.message}`);
    }
}

export async function updateUserTier(userId: string, tier: UserTier): Promise<void> {
    if (!db) {
        throw new Error('Firestore is not initialized');
    }
    // The 'api' tier is no longer offered. Existing api-tier accounts keep working,
    // but no one can switch into it.
    if (tier === USER_TIERS.API) {
        throw new Error('The API tier is no longer available.');
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
            apiKeys: userData?.apiKeys || {},
            tier: userData?.tier || 'free',
            spendings: normalizeSpendings(userData?.spendings),
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
        // rules. Legacy 'api'-tier accounts (own keys) are left untouched.
        if ((data?.tier || 'free') === USER_TIERS.FREE) {
            update.tier = USER_TIERS.PAID;
        }
        transaction.update(userRef, update);
    });
}

/**
 * Throws when the user's free-tier (platform-key) spend for the current month has
 * reached FREE_TIER_LIMITS.MONTHLY_SPEND_USD. Free/voice features run on our keys
 * with no per-call limit, so this caps unbounded platform-key spend per month.
 */
export async function assertFreeTierSpendWithinLimit(userId: string, timestamp: number = Date.now()): Promise<void> {
    if (!db) {
        throw new Error('Firestore is not initialized');
    }
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
        return;
    }
    const spent = getFreeSpendForPeriod(userDoc.data()?.spendings, formatPeriod(timestamp));
    if (spent >= FREE_TIER_LIMITS.MONTHLY_SPEND_USD) {
        throw new Error('Monthly free-tier voice limit reached. Add funds on your profile page to keep using voice features.');
    }
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
