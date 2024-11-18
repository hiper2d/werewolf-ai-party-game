'use server'

import {db} from "@/firebase/server";
import {firestore} from "firebase-admin";
import {
    Bot,
    BotPreview,
    Game,
    GAME_ROLES, GAME_STATES,
    GamePreview,
    GamePreviewWithGeneratedBots, User
} from "@/app/api/game-models";
import {getServerSession} from "next-auth";
import {AgentFactory} from "@/app/ai/agent-factory";
import {AbstractAgent} from "@/app/ai/abstract-agent";
import {GM_ID, LLM_CONSTANTS, MESSAGE_ROLE, RECIPIENT_ALL} from "@/app/ai/ai-models";
import {STORY_SYSTEM_PROMPT, STORY_USER_PROMPT} from "@/app/ai/prompts/story-gen-prompts";
import {format} from "@/app/ai/prompts/utils";
import FieldValue = firestore.FieldValue;
import {getUserApiKeys} from "@/app/api/user-actions";

export async function createGame(gamePreview: GamePreviewWithGeneratedBots): Promise<string|undefined> {
    if (!db) {
        throw new Error('Firestore is not initialized');
    }
    try {
        const totalPlayers = gamePreview.playerCount;
        const werewolfCount = gamePreview.werewolfCount;
        
        // Create role distribution array
        const roleDistribution: string[] = [];
        if (gamePreview.specialRoles.includes(GAME_ROLES.DOCTOR)) {
            roleDistribution.push(GAME_ROLES.DOCTOR);
        }
        if (gamePreview.specialRoles.includes(GAME_ROLES.DETECTIVE)) {
            roleDistribution.push(GAME_ROLES.DETECTIVE);
        }
        roleDistribution.push(...Array(werewolfCount).fill(GAME_ROLES.WEREWOLF));    
        const villagersNeeded = totalPlayers - roleDistribution.length;
        roleDistribution.push(...Array(villagersNeeded).fill(GAME_ROLES.VILLAGER));

        // Shuffle the roles
        for (let i = roleDistribution.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [roleDistribution[i], roleDistribution[j]] = [roleDistribution[j], roleDistribution[i]];
        }

        // Convert BotPreviews to Bots with roles
        const bots: Bot[] = gamePreview.bots.map((bot, index) => ({
            name: bot.name,
            story: bot.story,
            role: roleDistribution[index + 1],
            isAlive: true
        }));

        // Create the game object
        const game: Game = {
            id: crypto.randomUUID(), // This will be overwritten by Firestore
            description: gamePreview.description,
            theme: gamePreview.theme,
            werewolfCount: gamePreview.werewolfCount,
            specialRoles: gamePreview.specialRoles,
            gameMasterAiType: gamePreview.gameMasterAiType,
            story: gamePreview.scene,
            bots: bots,
            humanPlayerName: gamePreview.name,
            humanPlayerRole: roleDistribution[0],
            gameState: GAME_STATES.WELCOME,
            gameStateParamQueue: [], // todo: put bot names in random order
            gameStateProcessQueue: []
        };

        const response = await db.collection('games').add(game);
        // todo: add Welcome message to messages
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
            // todo: support only models for which user has API keys
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

function gameFromFirestore(id: string, data: any): Game {
    return {
        id,
        description: data.description,
        theme: data.theme,
        werewolfCount: data.werewolfCount,
        specialRoles: data.specialRoles,
        gameMasterAiType: data.gameMasterAiType,
        story: data.story,
        bots: data.bots,
        humanPlayerName: data.humanPlayerName,
        humanPlayerRole: data.humanPlayerRole,
        gameState: data.gameState,
        gameStateParamQueue: data.gameStateParamQueue,
        gameStateProcessQueue: data.gameStateProcessQueue
    };
}