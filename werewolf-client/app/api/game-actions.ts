'use server'

import {db} from "@/firebase/server";
import {
    Bot,
    BotPreview,
    Game,
    GAME_MASTER,
    GAME_ROLES,
    GAME_STATES,
    GameMessage,
    GamePreview,
    GamePreviewWithGeneratedBots,
    MessageType,
    RECIPIENT_ALL,
    User
} from "@/app/api/game-models";
import {auth} from "@/auth";
import {AgentFactory} from "@/app/ai/agent-factory";
import {STORY_SYSTEM_PROMPT, STORY_USER_PROMPT} from "@/app/ai/prompts/story-gen-prompts";
import {getUserApiKeys} from "@/app/api/user-actions";
import {convertToAIMessage, parseResponseToObj} from "@/app/utils/message-utils";
import {LLM_CONSTANTS} from "@/app/ai/ai-models";
import {AbstractAgent} from "../ai/abstract-agent";
import {format} from "@/app/ai/prompts/utils";
import {createGameSetupSchema} from "@/app/ai/prompts/ai-schemas";

export async function getAllGames(): Promise<Game[]> {
    if (!db) {
        throw new Error('Firestore is not initialized');
    }
    const collectionRef = db.collection('games');
    const snapshot = await collectionRef.get();

    return snapshot.docs.map((doc) => gameFromFirestore(doc.id, doc.data()));
}

export async function removeGameById(id: string) {
    if (!db) {
        throw new Error('Firestore is not initialized');
    }

    // Delete all messages for this game
    const messagesSnapshot = await db.collection('games').doc(id).collection('messages')
        .get();
    
    const batch = db.batch();
    
    // Add message deletions to batch
    messagesSnapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
    });
    
    // Add game deletion to batch
    const gameRef = db.collection('games').doc(id);
    batch.delete(gameRef);
    
    // Execute all deletions in a single atomic operation
    await batch.commit();
    
    return "ok";
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

export async function getGameMessages(gameId: string): Promise<GameMessage[]> {
    if (!db) {
        throw new Error('Firestore is not initialized');
    }

    const messagesSnapshot = await db.collection('games')
        .doc(gameId)
        .collection('messages')
        .orderBy('timestamp', 'asc')
        .get();

    return messagesSnapshot.docs.map(doc => ({
        id: doc.id,
        recipientName: doc.data().recipientName,
        authorName: doc.data().authorName,
        msg: doc.data().msg,
        messageType: doc.data().messageType,
        day: doc.data().day,
        timestamp: doc.data().timestamp
    }));
}

export async function copyGame(sourceGameId: string): Promise<string> {
    if (!db) {
        throw new Error('Firestore is not initialized');
    }

    // Get the source game
    const gameRef = db.collection('games').doc(sourceGameId);
    const gameSnap = await gameRef.get();

    if (!gameSnap.exists) {
        throw new Error('Source game not found');
    }

    // Get all messages for the source game
    const messagesSnapshot = await gameRef.collection('messages')
        .orderBy('timestamp', 'asc')
        .get();

    // Start a new batch write
    const batch = db.batch();

    // Create the new game
    const newGameRef = db.collection('games').doc();
    batch.set(newGameRef, gameSnap.data());

    // Create a messages subcollection in the new game
    const messagesPromises = messagesSnapshot.docs.map(async (messageDoc) => {
        const newMessageRef = newGameRef.collection('messages').doc();
        batch.set(newMessageRef, messageDoc.data());
    });

    // Wait for all message promises to resolve
    await Promise.all(messagesPromises);

    // Commit the batch
    await batch.commit();

    return newGameRef.id;
}

export async function previewGame(gamePreview: GamePreview): Promise<GamePreviewWithGeneratedBots> {
    const session = await auth();
    if (!session || !session.user?.email) {
        throw new Error('Not authenticated');
    }

    if (!db) {
        throw new Error('Firestore is not initialized');
    }

    const apiKeys = await getUserFromFirestore(session.user.email)
        .then((user) => getUserApiKeys(user!.email));

    const botCount = gamePreview.playerCount - 1; // exclude human player

    const storyTellAgent: AbstractAgent = AgentFactory.createAgent(
        GAME_MASTER, STORY_SYSTEM_PROMPT, gamePreview.gameMasterAiType, apiKeys
    )
        
    const userPrompt = format(STORY_USER_PROMPT, {
        theme: gamePreview.theme,
        description: gamePreview.description,
        excluded_name: gamePreview.name,
        number_of_players: botCount
    });

    const storyMessage: GameMessage = {
        id: null,
        recipientName: RECIPIENT_ALL,
        authorName: GAME_MASTER,
        msg: userPrompt,
        messageType: MessageType.GM_COMMAND,
        day: 1,
        timestamp: null
    };

    const schema = createGameSetupSchema();
    
    const rawResponse = await storyTellAgent.askWithSchema(schema, [convertToAIMessage(storyMessage)]);
    if (!rawResponse) {
        throw new Error('Failed to get AI response');
    }

    const aiResponse = parseResponseToObj(rawResponse);
    const bots: BotPreview[] = aiResponse.players.map((bot: { name: string; story: string }) => {
        let aiType = gamePreview.playersAiType;
        
        if (aiType === LLM_CONSTANTS.RANDOM) {
            // Support only models for which user has API keys (if needed)
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

export async function createGame(gamePreview: GamePreviewWithGeneratedBots): Promise<string|undefined> {
    const session = await auth();
    if (!session || !session.user?.email) {
        throw new Error('Not authenticated');
    }
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
            isAlive: true,
            aiType: bot.playerAiType
        }));

        // Create the game object
        const game = {
            description: gamePreview.description,
            theme: gamePreview.theme,
            werewolfCount: gamePreview.werewolfCount,
            specialRoles: gamePreview.specialRoles,
            gameMasterAiType: gamePreview.gameMasterAiType,
            story: gamePreview.scene,
            bots: bots,
            humanPlayerName: gamePreview.name,
            humanPlayerRole: roleDistribution[0],
            currentDay: 1,
            gameState: GAME_STATES.WELCOME,
            gameStateParamQueue: bots.map(bot => bot.name),
            gameStateProcessQueue: []
        };

        const response = await db.collection('games').add(game);
        
        const gameStoryMessage: GameMessage = {
            id: null,
            recipientName: RECIPIENT_ALL,
            authorName: GAME_MASTER, 
            msg: { story: game.story },  
            messageType: MessageType.GAME_STORY,
            day: game.currentDay,
            timestamp: null
        };

        await addMessageToChatAndSaveToDb(gameStoryMessage, response.id);
        return response.id;
    } catch (error: any) {
        console.error("Error adding document: ", error);
        throw new Error(`Failed to create game: ${error.message}`);
    }
}

export async function addMessageToChatAndSaveToDb(gameMessage: GameMessage, gameId: string): Promise<string | undefined> {
    if (!db) {
        throw new Error('Firestore is not initialized');
    }
    try {
        const response = await db.collection('games').doc(gameId).collection('messages').add(
            serializeMessageForFirestore(gameMessage)
        );
        return response.id;
    } catch (error: any) {
        console.error("Error adding message: ", error);
        throw new Error(`Failed to add message: ${error.message}`);
    }
}

export async function updateBotModel(gameId: string, botName: string, newAiType: string): Promise<Game> {
    if (!db) {
        throw new Error('Firestore is not initialized');
    }
    
    try {
        const gameRef = db.collection('games').doc(gameId);
        const gameSnap = await gameRef.get();
        
        if (!gameSnap.exists) {
            throw new Error('Game not found');
        }
        
        const gameData = gameSnap.data();
        const bots = gameData?.bots || [];
        
        // Find and update the bot
        const updatedBots = bots.map((bot: Bot) => {
            if (bot.name === botName) {
                return { ...bot, aiType: newAiType };
            }
            return bot;
        });
        
        // Update the game in Firestore
        await gameRef.update({ bots: updatedBots });
        
        // Return the updated game
        return gameFromFirestore(gameId, { ...gameData, bots: updatedBots });
    } catch (error: any) {
        console.error("Error updating bot model: ", error);
        throw new Error(`Failed to update bot model: ${error.message}`);
    }
}

/**
 * Get messages for a specific bot (messages sent to all players or directly to this bot)
 * Filters at the database level for better performance
 */
export async function getBotMessages(gameId: string, botName: string, day: number): Promise<GameMessage[]> {
    if (!db) {
        throw new Error('Firestore is not initialized');
    }

    // We need to perform two queries and combine the results:
    // 1. Messages where recipientName is RECIPIENT_ALL
    // 2. Messages where recipientName is the specific bot name
    
    const allMessagesQuery = db.collection('games')
        .doc(gameId)
        .collection('messages')
        .where('day', '==', day)
        .where('recipientName', '==', RECIPIENT_ALL)
        .orderBy('timestamp', 'asc');
        
    const directMessagesQuery = db.collection('games')
        .doc(gameId)
        .collection('messages')
        .where('day', '==', day)
        .where('recipientName', '==', botName)
        .orderBy('timestamp', 'asc');
        
    // Execute both queries
    const [allMessagesSnapshot, directMessagesSnapshot] = await Promise.all([
        allMessagesQuery.get(),
        directMessagesQuery.get()
    ]);
    
    // Combine and convert the results
    const allMessages = allMessagesSnapshot.docs.map(doc => ({
        id: doc.id,
        recipientName: doc.data().recipientName,
        authorName: doc.data().authorName,
        msg: doc.data().msg,
        messageType: doc.data().messageType,
        day: doc.data().day,
        timestamp: doc.data().timestamp
    }));
    
    const directMessages = directMessagesSnapshot.docs.map(doc => ({
        id: doc.id,
        recipientName: doc.data().recipientName,
        authorName: doc.data().authorName,
        msg: doc.data().msg,
        messageType: doc.data().messageType,
        day: doc.data().day,
        timestamp: doc.data().timestamp
    }));
    
    // Combine and sort by timestamp
    return [...allMessages, ...directMessages].sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Exported so bot-actions can access user details
 */
export async function getUserFromFirestore(email: string): Promise<User | null> {
    if (!db) {
        throw new Error('Firestore is not initialized');
    }

    const userRef = db.collection('users').doc(email);
    const userSnap = await userRef.get();

    if (userSnap.exists) {
        const userData = userSnap.data();
        return {
            name: userData?.name,
            email: userData?.email,
            apiKeys: userData?.ApiKeys || []
        };
    } else {
        return null;
    }
}

/* -----------------------------------------
    Private / helper functions
----------------------------------------- */

function serializeMessageForFirestore(gameMessage: GameMessage) {
    return {
        ...gameMessage,
        msg: gameMessage.messageType === MessageType.BOT_ANSWER ||
             gameMessage.messageType === MessageType.GAME_STORY ||
             gameMessage.messageType === MessageType.VOTE_MESSAGE
            ? gameMessage.msg  // keep as object
            : gameMessage.msg as string  // it's a string for most other message types
    };
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
        currentDay: data.currentDay,
        gameState: data.gameState,
        gameStateParamQueue: data.gameStateParamQueue,
        gameStateProcessQueue: data.gameStateProcessQueue
    };
}