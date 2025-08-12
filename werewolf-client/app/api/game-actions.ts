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
    getRandomVoiceForGender,
    MessageType,
    PLAY_STYLES,
    RECIPIENT_ALL,
    RECIPIENT_WEREWOLVES,
    ROLE_CONFIGS,
    SystemErrorMessage,
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

    // Resolve Game Master AI type if it's Random
    let resolvedGmAiType = gamePreview.gameMasterAiType;
    if (resolvedGmAiType === LLM_CONSTANTS.RANDOM) {
        const availableTypes = Object.values(LLM_CONSTANTS).filter(
            type => type !== LLM_CONSTANTS.RANDOM
        );
        resolvedGmAiType = availableTypes[Math.floor(Math.random() * availableTypes.length)];
    }

    const storyTellAgent: AbstractAgent = AgentFactory.createAgent(
        GAME_MASTER, STORY_SYSTEM_PROMPT, resolvedGmAiType, apiKeys
    )
        
    // Gather role configurations for the story generation
    const gameRoleConfigs = [];
    
    // Always include werewolves
    if (gamePreview.werewolfCount > 0) {
        gameRoleConfigs.push(ROLE_CONFIGS[GAME_ROLES.WEREWOLF]);
    }
    
    // Add special roles if included
    if (gamePreview.specialRoles.includes(GAME_ROLES.DOCTOR)) {
        gameRoleConfigs.push(ROLE_CONFIGS[GAME_ROLES.DOCTOR]);
    }
    if (gamePreview.specialRoles.includes(GAME_ROLES.DETECTIVE)) {
        gameRoleConfigs.push(ROLE_CONFIGS[GAME_ROLES.DETECTIVE]);
    }
    
    // Format role configurations for the prompt
    const gameRolesText = gameRoleConfigs.map(role => 
        `- **${role.name}** (${role.alignment}): ${role.description}`
    ).join('\n');

    const userPrompt = format(STORY_USER_PROMPT, {
        theme: gamePreview.theme,
        description: gamePreview.description,
        excluded_name: gamePreview.name,
        number_of_players: botCount,
        game_roles: gameRolesText,
        werewolf_count: gamePreview.werewolfCount
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
    const bots: BotPreview[] = aiResponse.players.map((bot: { name: string; gender: string; story: string }) => {
        let aiType = gamePreview.playersAiType;
        
        if (aiType === LLM_CONSTANTS.RANDOM) {
            // Support only models for which user has API keys (if needed)
            const availableTypes = Object.values(LLM_CONSTANTS).filter(
                type => type !== LLM_CONSTANTS.RANDOM
            );
            aiType = availableTypes[Math.floor(Math.random() * availableTypes.length)];
        }

        // Randomly assign play style
        const availablePlayStyles = Object.values(PLAY_STYLES);
        const randomPlayStyle = availablePlayStyles[Math.floor(Math.random() * availablePlayStyles.length)];

        // Assign gender and voice
        const gender = bot.gender as 'male' | 'female' | 'neutral';
        const voice = getRandomVoiceForGender(gender);

        return {
            name: bot.name,
            story: bot.story,
            playerAiType: aiType,
            playStyle: randomPlayStyle,
            gender: gender,
            voice: voice
        };
    });

    return {
        ...gamePreview,
        gameMasterAiType: resolvedGmAiType,
        gameMasterVoice: getRandomVoiceForGender('male'),
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

        // Get all player names (bots + human)
        const allPlayerNames = [gamePreview.name, ...gamePreview.bots.map(bot => bot.name)];

        // Convert BotPreviews to Bots with roles
        const bots: Bot[] = gamePreview.bots.map((bot, index) => {
            return {
                name: bot.name,
                story: bot.story,
                role: roleDistribution[index + 1],
                isAlive: true,
                aiType: bot.playerAiType,
                playStyle: bot.playStyle,
                gender: bot.gender,
                voice: bot.voice
            };
        });

        // Create the game object
        const game = {
            description: gamePreview.description,
            theme: gamePreview.theme,
            werewolfCount: gamePreview.werewolfCount,
            specialRoles: gamePreview.specialRoles,
            gameMasterAiType: gamePreview.gameMasterAiType,
            gameMasterVoice: gamePreview.gameMasterVoice,
            story: gamePreview.scene,
            bots: bots,
            humanPlayerName: gamePreview.name,
            humanPlayerRole: roleDistribution[0],
            currentDay: 1,
            gameState: GAME_STATES.WELCOME,
            gameStateParamQueue: bots.map(bot => bot.name),
            gameStateProcessQueue: [],
            messageCounter: 0 // Initialize message counter for new games
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
        const gameRef = db.collection('games').doc(gameId);
        const gameDoc = await gameRef.get();
        
        if (!gameDoc.exists) {
            throw new Error('Game not found');
        }
        
        const gameData = gameDoc.data();
        const currentCounter = gameData?.messageCounter || 0;
        const newCounter = currentCounter + 1;
        
        // Generate custom message ID: zero-padded-counter-author-to-recipient
        const sanitizedAuthor = sanitizeForId(gameMessage.authorName);
        const sanitizedRecipient = sanitizeForId(gameMessage.recipientName);
        const paddedCounter = newCounter.toString().padStart(6, '0'); // Zero-pad to 6 digits for proper sorting
        const customId = `${paddedCounter}-${sanitizedAuthor}-to-${sanitizedRecipient}`;
        
        // Update game counter
        await gameRef.update({ messageCounter: newCounter });
        
        // Add message with custom ID
        const messageRef = db.collection('games').doc(gameId).collection('messages').doc(customId);
        const messageData = {
            ...serializeMessageForFirestore(gameMessage),
            timestamp: Date.now() // Set timestamp if not provided
        };
        await messageRef.set(messageData);
        
        return customId;
    } catch (error: any) {
        console.error("Error adding message: ", error);
        throw new Error(`Failed to add message: ${error.message}`);
    }
}

/**
 * Sanitize names for use in message IDs
 * Converts to lowercase, replaces spaces and special chars with hyphens
 */
function sanitizeForId(name: string): string {
    return name.toLowerCase()
        .replace(/\s+/g, '-')           // Replace spaces with hyphens
        .replace(/[^a-z0-9-]/g, '')     // Remove non-alphanumeric chars except hyphens
        .replace(/-+/g, '-')            // Replace multiple hyphens with single hyphen
        .replace(/^-|-$/g, '');         // Remove leading/trailing hyphens
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

export async function updateGameMasterModel(gameId: string, newAiType: string): Promise<Game> {
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
        
        // Update the Game Master AI type in Firestore
        await gameRef.update({ gameMasterAiType: newAiType });
        
        // Return the updated game
        return gameFromFirestore(gameId, { ...gameData, gameMasterAiType: newAiType });
    } catch (error: any) {
        console.error("Error updating Game Master model: ", error);
        throw new Error(`Failed to update Game Master model: ${error.message}`);
    }
}

/**
 * Get messages for a specific bot (messages sent to all players or directly to this bot)
 * Includes day summaries from previous days and filters at the database level for better performance
 */
export async function getBotMessages(gameId: string, botName: string, day: number): Promise<GameMessage[]> {
    if (!db) {
        throw new Error('Firestore is not initialized');
    }

    // Get the game to check if this bot is a werewolf and get summaries
    const game = await getGame(gameId);
    if (!game) {
        throw new Error('Game not found');
    }
    
    // Check if this bot is a werewolf
    const bot = game.bots.find(b => b.name === botName);
    const isWerewolf = bot?.role === GAME_ROLES.WEREWOLF || 
                      (botName === game.humanPlayerName && game.humanPlayerRole === GAME_ROLES.WEREWOLF);

    const allMessages: GameMessage[] = [];

    // Add day summaries from previous days as system messages
    if (bot && bot.daySummaries && bot.daySummaries.length > 0) {
        // Add summaries for all days before the current day
        for (let i = 0; i < Math.min(bot.daySummaries.length, day - 1); i++) {
            if (bot.daySummaries[i] && bot.daySummaries[i].trim()) {
                const summaryMessage: GameMessage = {
                    id: `summary-day-${i + 1}-${botName}`, // Unique ID for summary
                    recipientName: botName,
                    authorName: GAME_MASTER,
                    msg: {
                        story: `Day ${i + 1} Summary: ${bot.daySummaries[i]}`
                    },
                    messageType: MessageType.GAME_STORY,
                    day: day, // Associate with current day for proper ordering
                    timestamp: 0 // Use timestamp 0 to ensure summaries appear first
                };
                allMessages.push(summaryMessage);
            }
        }
    }

    // Base queries that all bots get:
    // 1. Messages where recipientName is RECIPIENT_ALL
    // 2. Messages where recipientName is the specific bot name
    const queries = [
        db.collection('games')
            .doc(gameId)
            .collection('messages')
            .where('day', '==', day)
            .where('recipientName', '==', RECIPIENT_ALL)
            .orderBy('timestamp', 'asc'),
            
        db.collection('games')
            .doc(gameId)
            .collection('messages')
            .where('day', '==', day)
            .where('recipientName', '==', botName)
            .orderBy('timestamp', 'asc')
    ];
    
    // Add werewolf-only messages if this bot is a werewolf
    if (isWerewolf) {
        queries.push(
            db.collection('games')
                .doc(gameId)
                .collection('messages')
                .where('day', '==', day)
                .where('recipientName', '==', RECIPIENT_WEREWOLVES)
                .orderBy('timestamp', 'asc')
        );
    }
        
    // Execute all queries
    const snapshots = await Promise.all(queries.map(query => query.get()));
    
    // Combine all current day messages
    snapshots.forEach(snapshot => {
        snapshot.docs.forEach(doc => {
            allMessages.push({
                id: doc.id,
                recipientName: doc.data().recipientName,
                authorName: doc.data().authorName,
                msg: doc.data().msg,
                messageType: doc.data().messageType,
                day: doc.data().day,
                timestamp: doc.data().timestamp
            });
        });
    });
    
    // Remove duplicates and sort by timestamp (summaries with timestamp 0 will appear first)
    const uniqueMessages = allMessages.filter((message, index, array) => 
        array.findIndex(m => m.id === message.id) === index
    );
    
    return uniqueMessages.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
}

/**
 * Set error state for a game (persisted to database)
 */
export async function setGameErrorState(gameId: string, errorState: SystemErrorMessage): Promise<Game> {
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
        
        // Update the error state in Firestore
        await gameRef.update({ errorState: errorState });
        
        // Return the updated game
        return gameFromFirestore(gameId, { ...gameData, errorState: errorState });
    } catch (error: any) {
        console.error("Error setting game error state: ", error);
        throw new Error(`Failed to set game error state: ${error.message}`);
    }
}

/**
 * Clear error state for a game (persisted to database)
 */
export async function clearGameErrorState(gameId: string): Promise<Game> {
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
        
        // Clear the error state in Firestore
        await gameRef.update({ errorState: null });
        
        // Return the updated game
        return gameFromFirestore(gameId, { ...gameData, errorState: null });
    } catch (error: any) {
        console.error("Error clearing game error state: ", error);
        throw new Error(`Failed to clear game error state: ${error.message}`);
    }
}

/**
 * Start the next day by incrementing the day counter and setting state to DAY_DISCUSSION
 * Also generates day summaries for all bots for the previous day
 */
export async function startNextDay(gameId: string): Promise<Game> {
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
        const currentGame = gameFromFirestore(gameId, gameData);
        
        // Validate that we're in NIGHT_ENDS state
        if (gameData?.gameState !== GAME_STATES.NIGHT_ENDS) {
            throw new Error(`Cannot start next day from state: ${gameData?.gameState}. Expected: ${GAME_STATES.NIGHT_ENDS}`);
        }
        
        const currentDay = gameData.currentDay || 1;
        const nextDay = currentDay + 1;
        
        console.log(`🌅 DAY ${nextDay}: Starting new day and generating summaries for day ${currentDay}`);

        // Increment day and set to DAY_DISCUSSION
        await gameRef.update({
            currentDay: nextDay,
            gameState: GAME_STATES.DAY_DISCUSSION,
            gameStateParamQueue: [],
            gameStateProcessQueue: []
        });
        
        console.log(`🌅 DAY ${nextDay}: Started new day discussion phase`);
        
        // Return the updated game
        return await getGame(gameId) as Game;
    } catch (error: any) {
        console.error("Error starting next day: ", error);
        throw new Error(`Failed to start next day: ${error.message}`);
    }
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
             gameMessage.messageType === MessageType.VOTE_MESSAGE ||
             gameMessage.messageType === MessageType.WEREWOLF_ACTION ||
             gameMessage.messageType === MessageType.DOCTOR_ACTION
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
        gameMasterVoice: data.gameMasterVoice || getRandomVoiceForGender('male'), // Fallback for existing games
        story: data.story,
        bots: data.bots,
        humanPlayerName: data.humanPlayerName,
        humanPlayerRole: data.humanPlayerRole,
        currentDay: data.currentDay,
        gameState: data.gameState,
        gameStateParamQueue: data.gameStateParamQueue,
        gameStateProcessQueue: data.gameStateProcessQueue,
        errorState: data.errorState || null,
        nightResults: data.nightResults || {},
        messageCounter: data.messageCounter || 0 // Default to 0 for existing games
    };
}