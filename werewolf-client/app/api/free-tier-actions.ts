'use server'

import {db} from "@/firebase/server";
import {ApiKeyMap} from "@/app/api/game-models";

/**
 * Gets the global API keys used for free tier users
 * These keys are stored in a Firestore document at /config/freeTierApiKeys
 */
export async function getFreeTierApiKeys(): Promise<ApiKeyMap> {
    if (!db) {
        throw new Error('Firestore is not initialized');
    }
    try {
        const configDoc = await db.collection('config').doc('freeTierApiKeys').get();
        if (!configDoc.exists) {
            console.warn('Free tier API keys document does not exist');
            return {};
        }
        const data = configDoc.data();
        return data?.keys || {};
    } catch (error: any) {
        console.error("Error fetching free tier API keys: ", error);
        throw new Error(`Failed to fetch free tier API keys: ${error.message}`);
    }
}

/**
 * Updates a free tier API key
 * This function should only be called by admins
 */
export async function updateFreeTierApiKey(apiKeyName: string, value: string): Promise<void> {
    if (!db) {
        throw new Error('Firestore is not initialized');
    }
    try {
        const configRef = db.collection('config').doc('freeTierApiKeys');
        await configRef.set({
            [`keys.${apiKeyName}`]: value
        }, { merge: true });
    } catch (error: any) {
        console.error("Error updating free tier API key: ", error);
        throw new Error(`Failed to update free tier API key: ${error.message}`);
    }
}

/**
 * Initializes the free tier API keys document if it doesn't exist
 * This function should be called once during setup
 */
export async function initializeFreeTierApiKeys(): Promise<void> {
    if (!db) {
        throw new Error('Firestore is not initialized');
    }
    try {
        const configRef = db.collection('config').doc('freeTierApiKeys');
        const doc = await configRef.get();

        if (!doc.exists) {
            await configRef.set({
                keys: {},
                createdAt: new Date().toISOString(),
                lastUpdated: new Date().toISOString()
            });
            console.log('Initialized free tier API keys document');
        }
    } catch (error: any) {
        console.error("Error initializing free tier API keys: ", error);
        throw new Error(`Failed to initialize free tier API keys: ${error.message}`);
    }
}
