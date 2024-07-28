'use server'

import {db} from "@/firebase/server";
import {firestore} from "firebase-admin";
import FieldValue = firestore.FieldValue;
import {Game, gameFromFirestore, GamePreview} from "@/app/api/models";

export async function createGame(game: Game): Promise<string|undefined> {
    if (!db) {
        throw new Error('Firestore is not initialized');
    }
    try {
        const response = await db.collection('games').add(game);
        return response.id;
    } catch (error: any) {
        console.error("Error adding document: ", error);
        throw new Error(`Failed to create game: ${error.message}`);
    }
}

export async function previewGame(gamePreview: GamePreview): Promise<Game> {
    // fixme: implement logic
    return {
        id: '',
        name: gamePreview.name,
        theme: gamePreview.theme,
        playerCount: gamePreview.playerCount,
        werewolfCount: gamePreview.werewolfCount,
        specialRoles: gamePreview.specialRoles,
        aiModel: gamePreview.aiModel,
        story: 'This is a story',
        players: []
    };
}

export async function removeGameById(id: string) {
    if (!db) {
        throw new Error('Firestore is not initialized');
    }
    const response = await db.collection('games').doc(id).delete();
    return "ok"
}

export async function getGame(gameId: string): Promise<Game | null> {
    if (!db) {
        throw new Error('Firestore is not initialized');
    }

    const gameRef = db.collection('games').doc(gameId);
    const gameSnap = await gameRef.get();

    if (gameSnap.exists) {
        return gameFromFirestore(gameSnap.id, gameSnap.data());
    } else {
        return null;
    }
}

export async function getAllGames(): Promise<Game[]> {
    if (!db) {
        throw new Error('Firestore is not initialized');
    }
    const collectionRef = db.collection('games');
    const snapshot = await collectionRef.get();

    return snapshot.docs.map((doc) => gameFromFirestore(doc.id, doc.data()));
}

export async function createMessage(gameId: string, text: string, sender: string) {
    if (!db) {
        throw new Error('Firestore is not initialized');
    }
    try {
        // todo: Think if it makes sense to keep message in the games collection: `games/${gameId}/messages`

        const response = await db.collection('messages').add({
            text,
            sender,
            timestamp: FieldValue.serverTimestamp(),
            gameId
        });
        return response.id;
    } catch (error: any) {
        console.error("Error adding message: ", error);
        return { success: false, error: error.message };
    }
}

export async function upsertUser(user: any) {
    if (!db) {
        throw new Error('Firestore is not initialized');
    }

    const userRef = db.collection('users').doc(user.email);

    try {
        // Try to get the user document
        const doc = await userRef.get();

        if (!doc.exists) {
            // If the document doesn't exist, create a new user
            await userRef.set({
                email: user.email,
                created_at:  FieldValue.serverTimestamp(),
                last_login_timestamp:  FieldValue.serverTimestamp()
            });
            console.log(`New user created for ${user.name}`);
        } else {
            const res = await userRef.update({
                last_login_timestamp: FieldValue.serverTimestamp()
            })
            console.log(`Updated last_login_timestamp for existing user ${user.name}`);
        }
    } catch (error) {
        console.error("Error processing user:", error);
    }
}

export async function getUserApiKeys(userId: string): Promise<any[]> {
    if (!db) {
        throw new Error('Firestore is not initialized');
    }
    try {
        const apiKeysRef = db.collection('users').doc(userId).collection('apiKeys');
        const snapshot = await apiKeysRef.get();
        return snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
    } catch (error: any) {
        console.error("Error fetching API keys: ", error);
        throw new Error(`Failed to fetch API keys: ${error.message}`);
    }
}

export async function addApiKey(userId: string, type: string, value: string): Promise<string> {
    if (!db) {
        throw new Error('Firestore is not initialized');
    }
    try {
        const apiKeysRef = db.collection('users').doc(userId).collection('apiKeys');
        const response = await apiKeysRef.add({
            type,
            value,
            createdAt: FieldValue.serverTimestamp()
        });
        return response.id;
    } catch (error: any) {
        console.error("Error adding API key: ", error);
        throw new Error(`Failed to add API key: ${error.message}`);
    }
}

export async function updateApiKey(userId: string, keyId: string, newValue: string): Promise<void> {
    if (!db) {
        throw new Error('Firestore is not initialized');
    }
    try {
        const keyRef = db.collection('users').doc(userId).collection('apiKeys').doc(keyId);
        await keyRef.update({
            value: newValue,
            updatedAt: FieldValue.serverTimestamp()
        });
    } catch (error: any) {
        console.error("Error updating API key: ", error);
        throw new Error(`Failed to update API key: ${error.message}`);
    }
}

export async function deleteApiKey(userId: string, keyId: string): Promise<void> {
    if (!db) {
        throw new Error('Firestore is not initialized');
    }
    try {
        await db.collection('users').doc(userId).collection('apiKeys').doc(keyId).delete();
    } catch (error: any) {
        console.error("Error deleting API key: ", error);
        throw new Error(`Failed to delete API key: ${error.message}`);
    }
}