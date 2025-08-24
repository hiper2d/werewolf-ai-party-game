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
import {createGameSetupSchema, createBotAnswerSchema} from "@/app/ai/prompts/ai-schemas";
import {BOT_DAY_SUMMARY_PROMPT, BOT_SYSTEM_PROMPT} from "@/app/ai/prompts/bot-prompts";
import {generatePlayStyleDescription, generateWerewolfTeammatesSection, generatePreviousDaySummariesSection} from "@/app/utils/bot-utils";
import {convertToAIMessages} from "@/app/utils/message-utils";

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
        GAME_MASTER, STORY_SYSTEM_PROMPT, resolvedGmAiType, apiKeys, false
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
    
    const [rawResponse] = await storyTellAgent.askWithSchema(schema, [convertToAIMessage(storyMessage)]);
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


        // Assign gender and voice
        const gender = bot.gender as 'male' | 'female' | 'neutral';
        const voice = getRandomVoiceForGender(gender);

        // Randomly assign play style
        const availablePlayStyles = Object.values(PLAY_STYLES);
        const randomPlayStyle = availablePlayStyles[Math.floor(Math.random() * availablePlayStyles.length)];

        return {
            name: bot.name,
            story: bot.story,
            playerAiType: aiType,
            gender: gender,
            voice: voice,
            playStyle: randomPlayStyle
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
                gender: bot.gender,
                voice: bot.voice,
                playStyle: bot.playStyle,
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

        // Generate custom game ID: theme-timestamp
        const sanitizedTheme = sanitizeForId(gamePreview.theme);
        const timestamp = Date.now();
        const customGameId = `${sanitizedTheme}-${timestamp}`;
        
        await db.collection('games').doc(customGameId).set(game);
        
        const gameStoryMessage: GameMessage = {
            id: null,
            recipientName: RECIPIENT_ALL,
            authorName: GAME_MASTER, 
            msg: { story: game.story },  
            messageType: MessageType.GAME_STORY,
            day: game.currentDay,
            timestamp: null
        };

        await addMessageToChatAndSaveToDb(gameStoryMessage, customGameId);
        return customGameId;
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
        const updatedGameData = { 
            ...gameData, 
            gameMasterAiType: newAiType
        };
        return gameFromFirestore(gameId, updatedGameData);
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
 * End the night by applying night results and transitioning to NIGHT_ENDS_SUMMARY state
 */
export async function endNight(gameId: string): Promise<Game> {
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
        
        console.log(`🌙 Applying night results and transitioning to NIGHT_ENDS_SUMMARY`);

        // Apply night results - eliminate werewolf targets if successful
        let updatedBots = [...currentGame.bots];
        const nightResults = currentGame.nightResults || {};
        
        // Check if werewolves successfully killed someone
        if (nightResults.werewolf && nightResults.werewolf.target) {
            const targetName = nightResults.werewolf.target;
            
            // Check if doctor protected this target
            const doctorProtectedTarget = nightResults.doctor && nightResults.doctor.target === targetName;
            
            if (!doctorProtectedTarget) {
                // Eliminate the target
                updatedBots = updatedBots.map(bot => {
                    if (bot.name === targetName) {
                        console.log(`💀 ${targetName} was eliminated by werewolves`);
                        return { ...bot, isAlive: false, eliminationDay: currentGame.currentDay };
                    }
                    return bot;
                });
                
                // Also check if human player was the target
                if (targetName === currentGame.humanPlayerName) {
                    // Human player elimination would be handled by game over logic elsewhere
                    console.log(`💀 Human player ${targetName} was eliminated by werewolves`);
                }
            } else {
                console.log(`🏥 ${targetName} was saved by the doctor`);
            }
        }
        
        // Get all alive bot names for the processing queue
        const aliveBotNames = updatedBots.filter(bot => bot.isAlive).map(bot => bot.name);
        
        // Transition to NIGHT_ENDS_SUMMARY state and populate processing queue
        await gameRef.update({
            gameState: GAME_STATES.NIGHT_ENDS_SUMMARY,
            gameStateParamQueue: [],
            gameStateProcessQueue: aliveBotNames,
            bots: updatedBots
        });
        
        console.log(`💭 Transitioned to NIGHT_ENDS_SUMMARY with ${aliveBotNames.length} bots to summarize`);
        
        // Return the updated game
        return await getGame(gameId) as Game;
    } catch (error: any) {
        console.error("Error ending night: ", error);
        throw new Error(`Failed to end night: ${error.message}`);
    }
}

/**
 * Summarize current day for one bot (called sequentially from UI)
 */
export async function summarizeCurrentDay(gameId: string): Promise<Game> {
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
        
        // Validate that we're in NIGHT_ENDS_SUMMARY state
        if (gameData?.gameState !== GAME_STATES.NIGHT_ENDS_SUMMARY) {
            throw new Error(`Cannot summarize day from state: ${gameData?.gameState}. Expected: ${GAME_STATES.NIGHT_ENDS_SUMMARY}`);
        }
        
        // Get the first bot from the processing queue
        const processQueue = [...(gameData.gameStateProcessQueue || [])];
        if (processQueue.length === 0) {
            // No more bots to process, transition to NEW_DAY_BEGINS
            await gameRef.update({
                gameState: GAME_STATES.NEW_DAY_BEGINS,
                gameStateProcessQueue: []
            });
            console.log(`💭 All bot summaries completed, transitioning to NEW_DAY_BEGINS`);
            return await getGame(gameId) as Game;
        }
        
        const botName = processQueue.shift()!; // Get first bot and remove from queue
        const bot = currentGame.bots.find(b => b.name === botName);
        
        if (!bot || !bot.isAlive) {
            // Bot not found or not alive, skip and continue with next
            await gameRef.update({
                gameStateProcessQueue: processQueue
            });
            console.log(`💭 Bot ${botName} not found or not alive, skipping`);
            return await getGame(gameId) as Game;
        }
        
        console.log(`💭 Generating day ${currentGame.currentDay} summary for bot: ${botName}`);
        
        // Get all messages visible to this bot for the current day
        const botMessages = await getBotMessages(gameId, botName, currentGame.currentDay);
        
        if (botMessages.length === 0) {
            console.log(`💭 No messages found for bot ${botName} on day ${currentGame.currentDay}, skipping summary`);
            await gameRef.update({
                gameStateProcessQueue: processQueue
            });
            return await getGame(gameId) as Game;
        }
        
        const session = await auth();
        if (!session || !session.user?.email) {
            throw new Error('Not authenticated');
        }
        
        // Get API keys
        const user = await getUserFromFirestore(session.user.email);
        const apiKeys = await getUserApiKeys(user!.email);
        
        // Create bot system prompt
        const botPrompt = format(BOT_SYSTEM_PROMPT, {
            name: bot.name,
            personal_story: bot.story,
            play_style: "",
            role: bot.role,
            werewolf_teammates_section: generateWerewolfTeammatesSection(bot, currentGame),
            players_names: [
                ...currentGame.bots
                    .filter(b => b.name !== bot.name)
                    .map(b => b.name),
                currentGame.humanPlayerName
            ].join(", "),
            dead_players_names_with_roles: currentGame.bots
                .filter(b => !b.isAlive)
                .map(b => `${b.name} (${b.role})`)
                .join(", "),
            previous_day_summaries: generatePreviousDaySummariesSection(bot, currentGame.currentDay)
        });
        
        // Create summary request message
        const summaryPrompt = format(BOT_DAY_SUMMARY_PROMPT, {
            bot_name: bot.name,
            day_number: currentGame.currentDay
        });
        
        const summaryMessage: GameMessage = {
            id: null,
            recipientName: bot.name,
            authorName: GAME_MASTER,
            msg: summaryPrompt,
            messageType: MessageType.GM_COMMAND,
            day: currentGame.currentDay,
            timestamp: Date.now()
        };
        
        // Create agent
        const agent = AgentFactory.createAgent(bot.name, botPrompt, bot.aiType, apiKeys, false);
        
        // Create conversation history with all day messages + summary request
        const history = convertToAIMessages(bot.name, [...botMessages, summaryMessage]);
        
        // Get summary using bot answer schema (returns { reply: "summary text" })
        const [rawResponse] = await agent.askWithSchema(createBotAnswerSchema(), history);
        
        if (!rawResponse) {
            console.warn(`💭 Bot ${bot.name} failed to generate summary for day ${currentGame.currentDay}`);
            await gameRef.update({
                gameStateProcessQueue: processQueue
            });
            return await getGame(gameId) as Game;
        }
        
        let summary: string;
        try {
            const summaryResponse = parseResponseToObj(rawResponse);
            summary = summaryResponse.reply;
        } catch (parseError: any) {
            console.error(`💭 Failed to parse summary JSON for bot ${bot.name}:`, parseError);
            console.error('💭 Raw response:', rawResponse);
            
            // Try to extract summary from the raw response as fallback
            try {
                // If the response contains readable text but bad JSON, try to use it directly
                if (typeof rawResponse === 'string' && rawResponse.length > 0) {
                    // Clean up the response and use it as summary
                    summary = rawResponse
                        .replace(/```json/g, '')
                        .replace(/```/g, '')
                        .replace(/^\s*{\s*"reply"\s*:\s*"/, '')
                        .replace(/"\s*}\s*$/, '')
                        .trim();
                    
                    if (summary.length > 10) { // Basic validation
                        console.log(`💭 Using cleaned raw response as summary for bot ${bot.name}: ${summary.substring(0, 100)}...`);
                    } else {
                        throw new Error('Cleaned response too short');
                    }
                } else {
                    throw new Error('Empty or invalid response');
                }
            } catch (fallbackError) {
                console.error(`💭 Fallback summary extraction failed for bot ${bot.name}:`, fallbackError);
                
                // Skip this bot and continue with next
                await gameRef.update({
                    gameStateProcessQueue: processQueue
                });
                
                // Create a meaningful error that will be shown to the user
                throw new Error(`Bot ${bot.name} response parsing failed: ${parseError.message}. Raw response: ${rawResponse?.substring(0, 200)}...`);
            }
        }
        
        // Update the bot with the new summary
        const updatedBots = currentGame.bots.map(b => {
            if (b.name === botName) {
                // Initialize daySummaries array if needed
                const daySummaries = b.daySummaries || [];
                
                // Ensure array is large enough for this day index (day 1 -> index 0)
                while (daySummaries.length < currentGame.currentDay) {
                    daySummaries.push("");
                }
                
                // Store summary at correct index (day 1 -> index 0)
                daySummaries[currentGame.currentDay - 1] = summary;
                
                return {
                    ...b,
                    daySummaries: daySummaries
                };
            }
            return b;
        });
        
        // Update game with new bot data and remaining queue
        await gameRef.update({
            bots: updatedBots,
            gameStateProcessQueue: processQueue
        });
        
        console.log(`💭 ✅ Generated summary for bot ${botName} (${summary.length} chars). ${processQueue.length} bots remaining.`);
        
        return await getGame(gameId) as Game;
        
    } catch (error: any) {
        console.error("Error summarizing current day: ", error);
        throw new Error(`Failed to summarize current day: ${error.message}`);
    }
}

/**
 * Begin new day (placeholder function for now)
 */
export async function newDayBegins(gameId: string): Promise<Game> {
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
        
        // Validate that we're in NEW_DAY_BEGINS state
        if (gameData?.gameState !== GAME_STATES.NEW_DAY_BEGINS) {
            throw new Error(`Cannot begin new day from state: ${gameData?.gameState}. Expected: ${GAME_STATES.NEW_DAY_BEGINS}`);
        }
        
        const currentDay = gameData.currentDay || 1;
        const nextDay = currentDay + 1;
        
        console.log(`🌅 DAY ${nextDay}: Beginning new day`);
        
        // Increment day and set to DAY_DISCUSSION, reset activity counter for new day
        await gameRef.update({
            currentDay: nextDay,
            gameState: GAME_STATES.DAY_DISCUSSION,
            gameStateParamQueue: [],
            gameStateProcessQueue: [],
            dayActivityCounter: {} // Reset activity counter for new day
        });
        
        console.log(`🌅 DAY ${nextDay}: Started new day discussion phase`);
        
        return await getGame(gameId) as Game;
        
    } catch (error: any) {
        console.error("Error beginning new day: ", error);
        throw new Error(`Failed to begin new day: ${error.message}`);
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
        messageCounter: data.messageCounter || 0, // Default to 0 for existing games
        dayActivityCounter: data.dayActivityCounter || {} // Default to empty object for existing games
    };
}
