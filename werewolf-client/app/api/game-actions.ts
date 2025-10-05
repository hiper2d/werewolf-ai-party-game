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
    PLAY_STYLE_CONFIGS,
    RECIPIENT_ALL,
    RECIPIENT_WEREWOLVES,
    ROLE_CONFIGS,
    SystemErrorMessage,
    User,
    UserTier
} from "@/app/api/game-models";
import {auth} from "@/auth";
import {AgentFactory} from "@/app/ai/agent-factory";
import {STORY_SYSTEM_PROMPT, STORY_USER_PROMPT} from "@/app/ai/prompts/story-gen-prompts";
import {getUserTierAndApiKeys} from "@/app/utils/tier-utils";
import {getUserTier, updateUserMonthlySpending} from "@/app/api/user-actions";
import {normalizeSpendings} from "@/app/utils/spending-utils";
import {convertToAIMessage, parseResponseToObj} from "@/app/utils/message-utils";
import {LLM_CONSTANTS} from "@/app/ai/ai-models";
import {
    consumeModelUsage,
    getCandidateModelsForTier,
    getPerGameModelLimit,
    hasCapacity,
    validateModelUsageForTier
} from "@/app/ai/model-limit-utils";
import {AbstractAgent} from "../ai/abstract-agent";
import {format} from "@/app/ai/prompts/utils";
import {GameSetupZodSchema} from "@/app/ai/prompts/zod-schemas";
import {ensureUserCanAccessGame} from "@/app/api/tier-guards";

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
    
    // Delete messages individually
    const messageDeletePromises = messagesSnapshot.docs.map(doc => doc.ref.delete());
    await Promise.all(messageDeletePromises);
    
    // Delete the game
    const gameRef = db.collection('games').doc(id);
    await gameRef.delete();
    
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

    // Create the new game
    const newGameRef = db.collection('games').doc();
    const gameData = gameSnap.data();
    if (!gameData) {
        throw new Error('Source game data is empty');
    }
    await newGameRef.set(gameData);

    // Create a messages subcollection in the new game
    const messagesPromises = messagesSnapshot.docs.map(async (messageDoc) => {
        const newMessageRef = newGameRef.collection('messages').doc();
        return newMessageRef.set(messageDoc.data());
    });

    // Wait for all message promises to resolve
    await Promise.all(messagesPromises);

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

    const {tier, apiKeys} = await getUserTierAndApiKeys(session.user.email);
    const usageCounts: Record<string, number> = {};

    const botCount = gamePreview.playerCount - 1; // exclude human player

    // Resolve Game Master AI type with tier-aware restrictions
    let resolvedGmAiType = gamePreview.gameMasterAiType;
    if (resolvedGmAiType === LLM_CONSTANTS.RANDOM) {
        const candidates = getCandidateModelsForTier(tier).filter(model => hasCapacity(model, tier, usageCounts));
        if (candidates.length === 0) {
            throw new Error('No AI models are available for the game master on your current tier. Please adjust your selection or upgrade your plan.');
        }
        resolvedGmAiType = candidates[Math.floor(Math.random() * candidates.length)];
    }

    consumeModelUsage(resolvedGmAiType, tier, usageCounts, 'as the game master');

    const storyTellAgent: AbstractAgent = AgentFactory.createAgent(
        GAME_MASTER, STORY_SYSTEM_PROMPT, resolvedGmAiType, apiKeys, false
    );
        
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

    // Format playstyle configurations for the prompt
    const playStylesText = Object.entries(PLAY_STYLE_CONFIGS).map(([key, config]) => 
        `* ${key}: ${config.name} - ${config.uiDescription}`
    ).join('\n');

    const userPrompt = format(STORY_USER_PROMPT, {
        theme: gamePreview.theme,
        description: gamePreview.description,
        excluded_name: gamePreview.name,
        number_of_players: botCount,
        game_roles: gameRolesText,
        werewolf_count: gamePreview.werewolfCount,
        play_styles: playStylesText
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

    const [aiResponse, thinking, tokenUsage] = await storyTellAgent.askWithZodSchema(GameSetupZodSchema, [convertToAIMessage(storyMessage)]);
    if (!aiResponse) {
        throw new Error('Failed to get AI response');
    }

    if (tokenUsage) {
        await updateUserMonthlySpending(session.user.email, tokenUsage.costUSD);
    }
    const defaultPlayerCandidates = getCandidateModelsForTier(tier);

    const bots: BotPreview[] = aiResponse.players.map((bot: { name: string; gender: string; story: string; playStyle?: string; voiceInstructions: string }) => {
        let aiType: string;

        if (Array.isArray(gamePreview.playersAiType)) {
            const selectedModels = gamePreview.playersAiType.length > 0
                ? gamePreview.playersAiType
                : [LLM_CONSTANTS.RANDOM];

            if (tier === 'free') {
                const disallowedModel = selectedModels.find(model => {
                    if (model === LLM_CONSTANTS.RANDOM) {
                        return false;
                    }
                    return getPerGameModelLimit(model, tier) === 0;
                });

                if (disallowedModel) {
                    throw new Error(`The AI model ${disallowedModel} is not available on the free tier for bots. Please update your bot AI selection.`);
                }
            }

            const expandedCandidates = selectedModels.flatMap(model => {
                if (model === LLM_CONSTANTS.RANDOM) {
                    return defaultPlayerCandidates;
                }
                return [model];
            });

            const candidatesWithCapacity = expandedCandidates.filter(model => hasCapacity(model, tier, usageCounts));

            if (candidatesWithCapacity.length === 0) {
                throw new Error('No AI models are available for additional bots on the free tier with the current selection. Please adjust your bot AI model choices.');
            }

            aiType = candidatesWithCapacity[Math.floor(Math.random() * candidatesWithCapacity.length)];
        } else {
            // Legacy support for single string value
            aiType = gamePreview.playersAiType;

            if (aiType === LLM_CONSTANTS.RANDOM) {
                const candidates = defaultPlayerCandidates.filter(model => hasCapacity(model, tier, usageCounts));
                if (candidates.length === 0) {
                    throw new Error('No AI models are available for bots on your current tier. Please adjust your bot AI model selection.');
                }
                aiType = candidates[Math.floor(Math.random() * candidates.length)];
            }
        }

        consumeModelUsage(aiType, tier, usageCounts, 'for bots');

        // Assign gender and voice
        const gender = bot.gender as 'male' | 'female';
        const voice = getRandomVoiceForGender(gender);

        // Use AI-selected playstyle if available, otherwise fallback to random
        let playStyle = bot.playStyle;
        if (!playStyle || !Object.values(PLAY_STYLES).includes(playStyle as any)) {
            // Fallback to random if AI didn't provide a valid playstyle
            const availablePlayStyles = Object.values(PLAY_STYLES);
            playStyle = availablePlayStyles[Math.floor(Math.random() * availablePlayStyles.length)];
        }

        return {
            name: bot.name,
            story: bot.story,
            playerAiType: aiType,
            gender: gender,
            voice: voice,
            voiceInstructions: bot.voiceInstructions,
            playStyle: playStyle
        };
    });

    validateModelUsageForTier(tier, resolvedGmAiType, bots.map(bot => bot.playerAiType));

    return {
        ...gamePreview,
        gameMasterAiType: resolvedGmAiType,
        gameMasterVoice: getRandomVoiceForGender('male'),
        gameMasterVoiceInstructions: aiResponse.gameMasterVoiceInstructions,
        scene: aiResponse.scene,
        bots: bots,
        tokenUsage: tokenUsage
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
        const tier = await getUserTier(session.user.email);
        validateModelUsageForTier(tier, gamePreview.gameMasterAiType, gamePreview.bots.map(bot => bot.playerAiType));

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
                voiceInstructions: bot.voiceInstructions,
                playStyle: bot.playStyle,
            };
        });

        // Create the game object
        const timestamp = Date.now();
        const previewCost = gamePreview.tokenUsage?.costUSD || 0;
        
        const game = {
            description: gamePreview.description,
            theme: gamePreview.theme,
            werewolfCount: gamePreview.werewolfCount,
            specialRoles: gamePreview.specialRoles,
            gameMasterAiType: gamePreview.gameMasterAiType,
            gameMasterVoice: gamePreview.gameMasterVoice,
            gameMasterVoiceInstructions: gamePreview.gameMasterVoiceInstructions,
            story: gamePreview.scene,
            bots: bots,
            humanPlayerName: gamePreview.name,
            humanPlayerRole: roleDistribution[0],
            currentDay: 1,
            gameState: GAME_STATES.WELCOME,
            gameStateParamQueue: bots.map(bot => bot.name),
            gameStateProcessQueue: [],
            messageCounter: 0, // Initialize message counter for new games
            createdAt: timestamp, // Store creation timestamp
            createdWithTier: tier,
            totalGameCost: previewCost, // Total cost starts with preview generation cost
            gameMasterTokenUsage: gamePreview.tokenUsage ? {
                inputTokens: gamePreview.tokenUsage.inputTokens || 0,
                outputTokens: gamePreview.tokenUsage.outputTokens || 0,
                totalTokens: gamePreview.tokenUsage.totalTokens || 0,
                costUSD: previewCost
            } : {
                inputTokens: 0,
                outputTokens: 0,
                totalTokens: 0,
                costUSD: 0
            }
        };

        // Generate custom game ID: theme-timestamp
        const sanitizedTheme = sanitizeForId(gamePreview.theme);
        const customGameId = `${sanitizedTheme}-${timestamp}`;
        
        await db.collection('games').doc(customGameId).set(game);
        
        const gameStoryMessage: GameMessage = {
            id: null,
            recipientName: RECIPIENT_ALL,
            authorName: GAME_MASTER, 
            msg: { story: game.story },  
            messageType: MessageType.GAME_STORY,
            day: game.currentDay,
            timestamp: null,
            cost: previewCost
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
    const session = await auth();
    if (!session || !session.user?.email) {
        throw new Error('Not authenticated');
    }
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
        await ensureUserCanAccessGame(gameId, session.user.email, { gameTier: (gameData?.createdWithTier ?? 'free') });
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
    const session = await auth();
    if (!session || !session.user?.email) {
        throw new Error('Not authenticated');
    }
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
        await ensureUserCanAccessGame(gameId, session.user.email, { gameTier: (gameData?.createdWithTier ?? 'free') });
        
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
    const session = await auth();
    if (!session || !session.user?.email) {
        throw new Error('Not authenticated');
    }
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
        await ensureUserCanAccessGame(gameId, session.user.email, { gameTier: (gameData?.createdWithTier ?? 'free') });
        
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
    const session = await auth();
    if (!session || !session.user?.email) {
        throw new Error('Not authenticated');
    }
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
        await ensureUserCanAccessGame(gameId, session.user.email, { gameTier: (gameData?.createdWithTier ?? 'free') });
        
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
 * Move game to AFTER_GAME_DISCUSSION state
 * This is called when the Game Over button is clicked
 */
export async function afterGameDiscussion(gameId: string): Promise<Game> {
    const session = await auth();
    if (!session || !session.user?.email) {
        throw new Error('Not authenticated');
    }
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
        await ensureUserCanAccessGame(gameId, session.user.email, { gameTier: (gameData?.createdWithTier ?? 'free') });
        
        // Update the game state to AFTER_GAME_DISCUSSION
        await gameRef.update({ 
            gameState: GAME_STATES.AFTER_GAME_DISCUSSION,
            gameStateProcessQueue: [],
            gameStateParamQueue: []
        });
        
        // Return the updated game
        return gameFromFirestore(gameId, { 
            ...gameData, 
            gameState: GAME_STATES.AFTER_GAME_DISCUSSION,
            gameStateProcessQueue: [],
            gameStateParamQueue: []
        });
    } catch (error: any) {
        console.error("Error moving to after game discussion: ", error);
        throw new Error(`Failed to move to after game discussion: ${error.message}`);
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
            apiKeys: userData?.apiKeys || {},
            tier: userData?.tier || 'free',
            spendings: normalizeSpendings(userData?.spendings)
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
             gameMessage.messageType === MessageType.BOT_WELCOME ||
             gameMessage.messageType === MessageType.GAME_STORY ||
             gameMessage.messageType === MessageType.VOTE_MESSAGE ||
             gameMessage.messageType === MessageType.WEREWOLF_ACTION ||
             gameMessage.messageType === MessageType.DOCTOR_ACTION ||
             gameMessage.messageType === MessageType.NIGHT_SUMMARY
            ? gameMessage.msg  // keep as object
            : gameMessage.msg as string,  // it's a string for most other message types
        cost: gameMessage.cost || 0 // Ensure cost is never undefined
    };
}

/**
 * Extracts timestamp from game ID for backward compatibility
 * Game IDs are in format: "theme-timestamp"
 */
function extractTimestampFromGameId(gameId: string): number {
    try {
        const lastHyphenIndex = gameId.lastIndexOf('-');
        if (lastHyphenIndex === -1) {
            return Date.now(); // Fallback to current time
        }
        
        const timestampStr = gameId.substring(lastHyphenIndex + 1);
        const timestamp = parseInt(timestampStr, 10);
        
        // Validate that it's a reasonable timestamp (after year 2000)
        if (isNaN(timestamp) || timestamp < 946684800000) {
            return Date.now(); // Fallback to current time
        }
        
        return timestamp;
    } catch {
        return Date.now(); // Fallback to current time
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
        gameMasterVoice: data.gameMasterVoice || getRandomVoiceForGender('male'), // Fallback for existing games
        gameMasterVoiceInstructions: data.gameMasterVoiceInstructions,
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
        previousNightResults: data.previousNightResults || {},
        messageCounter: data.messageCounter || 0, // Default to 0 for existing games
        dayActivityCounter: data.dayActivityCounter || {}, // Default to empty object for existing games
        createdAt: data.createdAt || extractTimestampFromGameId(id), // Use stored timestamp or extract from ID for existing games
        totalGameCost: data.totalGameCost || 0,
        gameMasterTokenUsage: data.gameMasterTokenUsage || data.tokenUsage?.gameMasterUsage || null,
        createdWithTier: data.createdWithTier || 'free'
    };
}
