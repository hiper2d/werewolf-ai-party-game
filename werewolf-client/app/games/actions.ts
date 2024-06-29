'use server'

import {db} from "@/firebase/server";
import {Game} from '@/models/game';
import {firestore} from "firebase-admin";
import FieldValue = firestore.FieldValue;

export async function createGame(game: any): Promise<string|undefined> {
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

export async function removeGameById(id: string) {
    if (!db) {
        throw new Error('Firestore is not initialized');
    }
    const response = await db.collection('games').doc(id).delete();
    return response.writeTime
}

export async function getGame(gameId: string): Promise<Game | null> {
    if (!db) {
        throw new Error('Firestore is not initialized');
    }

    const gameRef = db.collection('games').doc(gameId);
    const gameSnap = await gameRef.get();

    if (gameSnap.exists) {
        return Game.fromFirestore(gameSnap.id, gameSnap.data());
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

    return snapshot.docs.map((doc) => Game.fromFirestore(doc.id, doc.data()));
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