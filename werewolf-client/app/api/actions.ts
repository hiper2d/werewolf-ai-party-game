'use server'

import {db} from "@/firebase/server";
import {firestore} from "firebase-admin";
import {ApiKeyMap, BotPreview, Game, gameFromFirestore, GamePreview, Player, User} from "@/app/api/models";
import {getServerSession} from "next-auth";
import {AgentFactory} from "@/app/ai/agent-factory";
import {AbstractAgent} from "@/app/ai/abstract-agent";
import FieldValue = firestore.FieldValue;
import {GM_ID, MESSAGE_ROLE, RECIPIENT_ALL} from "@/app/ai/models";
import {STORY_SYSTEM_PROMPT, STORY_USER_PROMPT} from "@/app/ai/prompts/story-gen-prompts";
import { GAME_ROLES } from '@/app/api/models';
import {format} from "@/app/ai/prompts/utils";
import { GamePreviewWithGeneratedBots } from "@/app/api/models";
import { LLM_CONSTANTS } from '@/app/ai/models';

export async function createGame(game: GamePreviewWithGeneratedBots): Promise<string|undefined> {
    if (!db) {
        throw new Error('Firestore is not initialized');
    }
    try {
        // todo: add logic to generate Game from GamePreviewWithGeneratedBots
        const response = await db.collection('games').add(game);
        return response.id;
    } catch (error: any) {
        console.error("Error adding document: ", error);
        throw new Error(`Failed to create game: ${error.message}`);
    }
}

export async function previewGame(gamePreview: GamePreview): Promise<GamePreviewWithGeneratedBots> {
    const session = await getServerSession();
    if (!session || !session.user?.email) {
        throw new Error('Not authenticated');
    }

    if (!db) {
        throw new Error('Firestore is not initialized');
    }

    const apiKeys = await getUserFromFirestore(session.user.email)
        .then((user) => getUserApiKeys(user!.email));

    const botCount = gamePreview.playerCount - 1; // exclude human player
    
    const userPrompt = format(STORY_USER_PROMPT, {
        theme: gamePreview.theme,
        description: gamePreview.description,
        excluded_name: gamePreview.name,
        number_of_players: botCount
    });

    const storyTellAgent: AbstractAgent = AgentFactory.createAgent(
        GM_ID, GM_ID, STORY_SYSTEM_PROMPT, gamePreview.gameMasterAiType, apiKeys
    )
    const response = await storyTellAgent.ask([{
        recipientId: RECIPIENT_ALL,
        authorId: GM_ID,
        authorName: GM_ID,
        role: MESSAGE_ROLE.USER,
        msg: userPrompt
    }])

    if (!response) {
        throw new Error('Failed to get AI response');
    }

    // Clean up potential markdown formatting
    let cleanResponse = response.trim();
    if (cleanResponse.startsWith('```json')) {
        cleanResponse = cleanResponse.slice(7); // Remove leading ```json
    } else if (cleanResponse.startsWith('```')) {
        cleanResponse = cleanResponse.slice(3); // Remove leading ```
    }
    if (cleanResponse.endsWith('```')) {
        cleanResponse = cleanResponse.slice(0, -3); // Remove trailing ```
    }

    const aiResponse = JSON.parse(cleanResponse.trim());

    const bots: BotPreview[] = aiResponse.players.map((bot: { name: string; story: string }) => {
        let aiType = gamePreview.playersAiType;
        
        if (aiType === LLM_CONSTANTS.RANDOM) {
            const availableTypes = Object.values(LLM_CONSTANTS).filter(
                type => type !== LLM_CONSTANTS.RANDOM
            );
            aiType = availableTypes[Math.floor(Math.random() * availableTypes.length)];
        }

        return {
            name: bot.name,
            story: bot.story,
            playerAiType: aiType
        };
    });

    /*
    const totalPlayers = gamePreview.playerCount;
    const werewolfCount = gamePreview.werewolfCount;
    
    const roleDistribution: string[] = [];
    
    if (gamePreview.specialRoles.includes(GAME_ROLES.DOCTOR)) {
        roleDistribution.push(GAME_ROLES.DOCTOR);
    }
    if (gamePreview.specialRoles.includes(GAME_ROLES.SEER)) {
        roleDistribution.push(GAME_ROLES.SEER);
    }
    roleDistribution.push(...Array(werewolfCount).fill(GAME_ROLES.WEREWOLF));    
    const villagersNeeded = totalPlayers - roleDistribution.length;
    roleDistribution.push(...Array(villagersNeeded).fill(GAME_ROLES.VILLAGER));

    // Shuffle the roles
    for (let i = roleDistribution.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [roleDistribution[i], roleDistribution[j]] = [roleDistribution[j], roleDistribution[i]];
    }

    const humanPlayer = {
        id: crypto.randomUUID(),
        name: gamePreview.name,
        role: roleDistribution[0],
        isAlive: true,
        isBot: false
    }
    const bots: Player[] = [];

    aiResponse.players.forEach((p: { name: string; story: string }, index: number) => {
        bots.push({
            id: crypto.randomUUID(),
            name: p.name,
            story: p.story,
            role: roleDistribution[index + 1],
            isAlive: true,
            isBot: true
        });
    });
    */



    return {
        ...gamePreview,
        scene: aiResponse.scene,
        bots: bots
    };
}

export async function removeGameById(id: string) {
    if (!db) {
        throw new Error('Firestore is not initialized');
    }
    const response = await db.collection('games').doc(id).delete();
    return "ok"
}

// todo: update this to use Game object
export async function getGame(gameId: string): Promise<GamePreviewWithGeneratedBots | null> {
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

// todo: update this to use Game object
export async function getAllGames(): Promise<GamePreviewWithGeneratedBots[]> {
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