'use server'

import {db} from "@/firebase/server";
import {firestore} from "firebase-admin";
import {ApiKeyMap, Game, gameFromFirestore, GamePreview, Player, User} from "@/app/api/models";
import {getServerSession} from "next-auth";
import {AgentFactory} from "@/app/ai/agent-factory";
import {AbstractAgent} from "@/app/ai/abstract-agent";
import FieldValue = firestore.FieldValue;
import {GM_ID, MESSAGE_ROLE, RECIPIENT_ALL} from "@/app/ai/models";
import {STORY_PROMPT} from "@/app/ai/prompts/story-gen-prompts";
import {format} from "@/app/ai/prompts/utils";

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
    const session = await getServerSession();
    if (!session || !session.user?.email) {
        throw new Error('Not authenticated');
    }

    if (!db) {
        throw new Error('Firestore is not initialized');
    }

    const apiKeys = await getUserFromFirestore(session.user.email)
        .then((user) => getUserApiKeys(user!.email));

    // fixme: implement logic
    const instruction = format(STORY_PROMPT, { theme: gamePreview.theme });

    const storyTellAgent: AbstractAgent = AgentFactory.createAgent(
        GM_ID, GM_ID, instruction, gamePreview.gameMasterAiType, apiKeys
    )
    const ans = await storyTellAgent.ask([{
        recipientId: RECIPIENT_ALL,
        authorId: GM_ID,
        authorName: GM_ID,
        role: MESSAGE_ROLE.USER,
        msg: "How are you?"
    }])

    return {
        ...gamePreview,
        story: 'This is a story',
        players: Array<Player>()
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
        const doc = await userRef.get();

        if (!doc.exists) {
            await userRef.set({
                ...user,
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

async function getUserFromFirestore(email: string) {
    if (!db) {
        throw new Error('Firestore is not initialized');
    }

    const userRef = db.collection('users').doc(email);
    const userSnap = await userRef.get();

    if (userSnap.exists) {
        const userData = userSnap.data();

        const user: User = {
            name: userData?.name,
            email: userData?.email,
            apiKeys: userData?.ApiKeys || []
        };

        return user;
    } else {
        return null;
    }
}