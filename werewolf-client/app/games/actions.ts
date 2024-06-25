'use server'

import {addDoc, collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp} from "firebase/firestore";
import {db} from "@/config/firebase";
import {Game} from '@/models/game';

export async function createGame(game: any): Promise<string> {
    try {
        const docRef = await addDoc(
            collection(db, "games"),
            game
        );
        return docRef.id;
    } catch (error: any) {
        console.error("Error adding document: ", error);
        throw new Error(`Failed to create game: ${error.message}`);
    }
}

export async function removeGameById(id: string) {
    await deleteDoc(doc(db, "games", id));
}

export async function getGame(gameId: string): Promise<Game | null> {
    const gameRef = doc(db, "games", gameId);
    const gameSnap = await getDoc(gameRef);

    if (gameSnap.exists()) {
        return Game.fromFirestore(gameSnap.id, gameSnap.data());
    } else {
        return null;
    }
}

export async function getAllGames(): Promise<Game[]> {
    const collectionRef = collection(db, 'games');
    const q = await getDocs(collectionRef);

    return q.docs.map((doc) => Game.fromFirestore(doc.id, doc.data()));
}

export async function createMessage(gameId: string, text: string, sender: string) {
    try {
        // todo: Think if it makes sense to keep message in the games collection: `games/${gameId}/messages`
        const docRef = await addDoc(collection(db, `messages`), {
            text,
            sender,
            timestamp: serverTimestamp(),
            gameId
        });
        return docRef.id;
    } catch (error: any) {
        console.error("Error adding message: ", error);
        return { success: false, error: error.message };
    }
}