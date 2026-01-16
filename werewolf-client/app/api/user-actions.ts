'use server'

import {db} from "@/firebase/server";
import {firestore} from "firebase-admin";
import {ApiKeyMap, User, UserMonthlySpending, UserTier} from "@/app/api/game-models";
import {VoiceProvider, getDefaultVoiceProvider} from "@/app/ai/voice-config";
import {normalizeSpendings} from "@/app/utils/spending-utils";
import FieldValue = firestore.FieldValue;

const ZERO_SPENDINGS: UserMonthlySpending[] = [];

function formatPeriod(timestamp: number): string {
    const date = new Date(timestamp);
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
}

export async function upsertUser(user: any) {
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
        } else {
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
        }
    } catch (error) {
        console.error("Error processing user:", error);
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
        const currentSpendings = normalizeSpendings(currentData?.spendings);

        let periodUpdated = false;
        const updatedSpendings = currentSpendings.map(record => {
            if (record.period === period) {
                periodUpdated = true;

                // Update total amount
                const newTotal = parseFloat((record.amountUSD + normalizedAmount).toFixed(6));

                // Update tier-specific amount if tier is provided
                let freeAmount = record.freeAmountUSD || 0;
                let apiAmount = record.apiAmountUSD || 0;

                if (tier === 'free') {
                    freeAmount = parseFloat((freeAmount + normalizedAmount).toFixed(6));
                } else if (tier === 'api') {
                    apiAmount = parseFloat((apiAmount + normalizedAmount).toFixed(6));
                }

                return {
                    period: record.period,
                    amountUSD: newTotal,
                    freeAmountUSD: freeAmount,
                    apiAmountUSD: apiAmount
                } as UserMonthlySpending;
            }
            return record;
        });

        if (!periodUpdated) {
            const newRecord: UserMonthlySpending = {
                period,
                amountUSD: normalizedAmount,
                freeAmountUSD: tier === 'free' ? normalizedAmount : 0,
                apiAmountUSD: tier === 'api' ? normalizedAmount : 0
            };
            updatedSpendings.push(newRecord);
        }

        updatedSpendings.sort((a, b) => b.period.localeCompare(a.period));

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
            voiceProvider: userData?.voiceProvider || getDefaultVoiceProvider()
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
