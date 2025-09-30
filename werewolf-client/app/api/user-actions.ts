'use server'

import {db} from "@/firebase/server";
import {firestore} from "firebase-admin";
import {ApiKeyMap, User, UserTier} from "@/app/api/game-models";
import FieldValue = firestore.FieldValue;

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
                last_login_timestamp: FieldValue.serverTimestamp()
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
                last_login_timestamp: FieldValue.serverTimestamp()
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
        // Ensure tier field exists for backward compatibility
        return {
            name: userData?.name || '',
            email: userData?.email || userId,
            apiKeys: userData?.apiKeys || {},
            tier: userData?.tier || 'free'
        } as User;
    } catch (error: any) {
        console.error("Error fetching user: ", error);
        throw new Error(`Failed to fetch user: ${error.message}`);
    }
}