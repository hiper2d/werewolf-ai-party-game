'use server';

import {db} from "@/firebase/server";
import {
    Bot,
    BotAnswer,
    BotResponseError,
    Game,
    GAME_MASTER,
    GAME_ROLES,
    GAME_STATES,
    GameMessage,
    MessageType,
    RECIPIENT_ALL,
    RECIPIENT_DETECTIVE,
    RECIPIENT_DOCTOR,
    RECIPIENT_WEREWOLVES
} from "@/app/api/game-models";
import {
    GM_COMMAND_INTRODUCE_YOURSELF,
    GM_COMMAND_REPLY_TO_DISCUSSION,
    GM_COMMAND_SELECT_RESPONDERS
} from "@/app/ai/prompts/gm-commands";
import {BOT_REMINDER_POSTFIX, BOT_SYSTEM_PROMPT, BOT_VOTE_PROMPT} from "@/app/ai/prompts/bot-prompts";
import {GM_ROUTER_SYSTEM_PROMPT, HUMAN_SUGGESTION_PROMPT} from "@/app/ai/prompts/gm-prompts";
import {BotAnswerZodSchema, BotVoteZodSchema, GmBotSelectionZodSchema} from "@/app/ai/prompts/zod-schemas";
import {AgentFactory} from "@/app/ai/agent-factory";
import {format} from "@/app/ai/prompts/utils";
import {auth} from "@/auth";
import {
    convertToAIMessages,
    generateEliminationMessage,
    generateVotingResultsMessage,
    parseResponseToObj
} from "@/app/utils/message-utils";
import {ModelError} from "@/app/ai/errors";
import {
    addMessageToChatAndSaveToDb,
    getBotMessages,
    getGame,
    getGameMessages,
    getUserFromFirestore
} from "./game-actions";
import {getUserApiKeys} from "./user-actions";
import {withGameErrorHandling} from "@/app/utils/server-action-wrapper";
import {
    generatePlayStyleDescription,
    generatePreviousDaySummariesSection,
    generateWerewolfTeammatesSection
} from "@/app/utils/bot-utils";
import {checkGameEndConditions} from "@/app/utils/game-utils";

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

/**
 * Increment day activity counter for a bot
 * Initializes the counter if it doesn't exist for the current day
 */
async function incrementDayActivity(gameId: string, botName: string, currentDay: number): Promise<void> {
    if (!db) {
        throw new Error('Firestore is not initialized');
    }

    const gameRef = db.collection('games').doc(gameId);
    
    try {
        const gameDoc = await gameRef.get();
        if (!gameDoc.exists) {
            throw new Error('Game not found during activity increment');
        }
        
        const game = gameDoc.data() as Game;
        const currentCounter = game.dayActivityCounter || {};
        
        // Initialize counter for the bot if it doesn't exist
        const updatedCounter = {
            ...currentCounter,
            [botName]: (currentCounter[botName] || 0) + 1
        };
        
        await gameRef.update({
            dayActivityCounter: updatedCounter
        });
    } catch (error) {
        console.error(`Failed to increment day activity for ${botName}:`, error);
        // Don't throw here - activity tracking shouldn't break the game flow
    }
}

/**
 * Recalculate day activity counter from actual messages in the database
 * This ensures accuracy after message resets or other operations
 */
export async function recalculateDayActivity(gameId: string, currentDay: number): Promise<void> {
    if (!db) {
        throw new Error('Firestore is not initialized');
    }

    try {
        // Get all messages for the current day
        const messages = await getGameMessages(gameId);
        const dayMessages = messages.filter(m => m.day === currentDay);

        // Count BOT_ANSWER messages for each bot that are sent to ALL
        const activityCounter: Record<string, number> = {};
        
        dayMessages.forEach(message => {
            // Only count BOT_ANSWER messages sent to ALL (public discussion messages)
            // This excludes private messages like werewolf coordination or detective reports
            if (message.messageType === MessageType.BOT_ANSWER && 
                message.recipientName === RECIPIENT_ALL &&
                message.authorName !== GAME_MASTER &&
                message.authorName && 
                message.authorName.trim() !== '') {
                
                activityCounter[message.authorName] = (activityCounter[message.authorName] || 0) + 1;
            }
        });

        console.log(`Recalculated day ${currentDay} activity:`, activityCounter);

        // Update the game with recalculated counter
        const gameRef = db.collection('games').doc(gameId);
        await gameRef.update({
            dayActivityCounter: activityCounter
        });

    } catch (error) {
        console.error(`Failed to recalculate day activity for game ${gameId}, day ${currentDay}:`, error);
        // Don't throw here - activity tracking shouldn't break the game flow
    }
}

/**
 * Ensure the game has a day activity counter initialized
 * For backward compatibility with games created before this feature
 */
async function ensureDayActivityCounter(gameId: string): Promise<void> {
    if (!db) {
        throw new Error('Firestore is not initialized');
    }

    try {
        const gameRef = db.collection('games').doc(gameId);
        const gameDoc = await gameRef.get();
        
        if (!gameDoc.exists) {
            return;
        }
        
        const game = gameDoc.data() as Game;
        
        // If the game doesn't have a dayActivityCounter, initialize it
        if (!game.dayActivityCounter) {
            console.log(`🆕 Initializing day activity counter for game ${gameId}`);
            await gameRef.update({
                dayActivityCounter: {}
            });
        }
    } catch (error) {
        console.error(`Failed to ensure day activity counter for game ${gameId}:`, error);
        // Don't throw - this is a best-effort initialization
    }
}

/**
 * Format day activity data for the GM prompt
 * Returns a human-readable string showing activity levels for each alive bot
 */
function formatDayActivityData(game: Game): string {
    const activityCounter = game.dayActivityCounter || {};
    const aliveBots = game.bots.filter(bot => bot.isAlive);
    
    if (aliveBots.length === 0) {
        return "No alive bots to track activity.";
    }
    
    const activityData = aliveBots.map(bot => {
        const messageCount = activityCounter[bot.name] || 0;
        return `${bot.name}: ${messageCount} messages`;
    }).join(", ");

    return `Today's activity levels - ${activityData}`;
}


async function welcomeImpl(gameId: string): Promise<Game> {
    const session = await auth();
    if (!session || !session.user?.email) {
        throw new Error('Not authenticated');
    }
    if (!db) {
        throw new Error('Firestore is not initialized');
    }
    const game = await getGame(gameId);
    if (!game) {
        throw new Error('Game not found');
    }

    try {
        // If queue is empty, move to DAY_DISCUSSION state
        if (game.gameStateParamQueue.length === 0) {
            await db.collection('games').doc(gameId).update({
                gameState: GAME_STATES.DAY_DISCUSSION,
                gameStateProcessQueue: [] // Ensure the process queue is empty for DAY_DISCUSSION
            });
            return await getGame(gameId) as Game;
        }

        // Get the first bot name and remove it from queue
        const botName = game.gameStateParamQueue[0];
        const newQueue = game.gameStateParamQueue.slice(1);

        // Find the bot in the game's bots array
        const bot: Bot | undefined = game.bots.find(b => b.name === botName);
        if (!bot) {
            throw new Error(`Bot ${botName} not found in game`);
        }

        const apiKeys = await getUserFromFirestore(session.user.email)
            .then((user) => getUserApiKeys(user!.email));

        const botPrompt = format(BOT_SYSTEM_PROMPT,
            {
                name: bot.name,
                personal_story: bot.story,
                play_style: "",
                role: bot.role,
                werewolf_teammates_section: generateWerewolfTeammatesSection(bot, game),
                players_names: [
                    ...game.bots
                        .filter(b => b.name !== bot.name)
                        .map(b => b.name),
                    game.humanPlayerName
                ].join(", "),
                dead_players_names_with_roles: game.bots
                    .filter(b => !b.isAlive)
                    .map(b => `${b.name} (${b.role})`)
                    .join(", "),
                previous_day_summaries: generatePreviousDaySummariesSection(bot, game.currentDay)
            }
        );

        const agent = AgentFactory.createAgent(bot.name, botPrompt, bot.aiType, apiKeys, false);

        // Create the game master command message
        const gmMessage: GameMessage = {
            id: null,
            recipientName: bot.name,
            authorName: GAME_MASTER,
            msg: format(GM_COMMAND_INTRODUCE_YOURSELF, { bot_name: bot.name }),
            messageType: MessageType.GM_COMMAND,
            day: game.currentDay,
            timestamp: Date.now()
        };

        // Get messages for this bot (ALL + direct messages to this bot)
        const botMessages = await getBotMessages(gameId, bot.name, game.currentDay);

        // Create history from filtered messages, including the GM command that hasn't been saved yet
        const history = convertToAIMessages(bot.name, [...botMessages, gmMessage]);
        const [answer, thinking] = await agent.askWithZodSchema(BotAnswerZodSchema, history);
        if (!answer) {
            throw new BotResponseError(
                'Bot failed to provide introduction',
                `Bot ${bot.name} did not respond to introduction request`,
                { botName: bot.name, aiType: bot.aiType },
                true
            );
        }

        const botMessage: GameMessage = {
            id: null,
            recipientName: RECIPIENT_ALL,
            authorName: bot.name,
            msg: { reply: answer.reply, thinking: thinking || "" },
            messageType: MessageType.BOT_ANSWER,
            day: game.currentDay,
            timestamp: Date.now()
        };

        // Save the game master command to the database first
        await addMessageToChatAndSaveToDb(gmMessage, gameId);
        
        // Then save the bot's response
        await addMessageToChatAndSaveToDb(botMessage, gameId);

        // Increment day activity counter for the bot
        await incrementDayActivity(gameId, bot.name, game.currentDay);

        // Update game with the modified queue
        await db.collection('games').doc(gameId).update({
            gameStateParamQueue: newQueue
        });

        // Return the updated game state
        return await getGame(gameId) as Game;
    } catch (error) {
        console.error('Error in welcome function:', error);
        throw error;
    }
}

async function talkToAllImpl(gameId: string, userMessage: string): Promise<Game> {
    // Common authentication and validation
    const session = await auth();
    if (!session || !session.user?.email) {
        throw new Error('Not authenticated');
    }
    if (!db) {
        throw new Error('Firestore is not initialized');
    }

    // Fetch the current game
    const game = await getGame(gameId);
    if (!game) {
        throw new Error('Game not found');
    }

    // Validate game state
    if (game.gameState !== GAME_STATES.DAY_DISCUSSION) {
        throw new Error('Game is not in DAY_DISCUSSION state');
    }

    try {
        // Case 1: Human player initiates discussion
        if (userMessage && game.gameStateProcessQueue.length === 0) {
            await handleHumanPlayerMessage(gameId, game, userMessage, session.user.email);
        }
        // Case 2: Process next bot in queue
        else if (game.gameStateProcessQueue.length > 0) {
            await processNextBotInQueue(gameId, game, session.user.email);
        }

        // Return updated game state
        return await getGame(gameId) as Game;
    } catch (error) {
        console.error('Error in talkToAll function:', error);
        throw error;
    }
}

async function keepBotsGoingImpl(gameId: string): Promise<Game> {
    // Common authentication and validation
    const session = await auth();
    if (!session || !session.user?.email) {
        throw new Error('Not authenticated');
    }
    if (!db) {
        throw new Error('Firestore is not initialized');
    }

    // Fetch the current game
    const game = await getGame(gameId);
    if (!game) {
        throw new Error('Game not found');
    }

    // Validate game state
    if (game.gameState !== GAME_STATES.DAY_DISCUSSION) {
        throw new Error('Game is not in DAY_DISCUSSION state');
    }

    // Only allow if no bots are currently in queue (empty queue means we can start new bot conversation)
    if (game.gameStateProcessQueue.length > 0) {
        throw new Error('Bots are already in conversation queue');
    }

    try {
        // Get all messages for the current day to provide context to GM
        const messages = await getGameMessages(gameId);
        const dayMessages = messages.filter(m => m.day === game.currentDay);

        // Ask GM which bots should continue the conversation (without human input)
        const apiKeys = await getUserFromFirestore(session.user.email).then((user) => getUserApiKeys(user!.email));

        // Ensure day activity counter is initialized for backward compatibility
        await ensureDayActivityCounter(gameId);

        // Use existing activity counter - it's maintained incrementally and only recalculated after resets
        const gmPrompt = format(GM_ROUTER_SYSTEM_PROMPT, {
            players_names: [
                ...game.bots.map(b => b.name),
                game.humanPlayerName
            ].join(", "),
            dead_players_names_with_roles: game.bots
                .filter(b => !b.isAlive)
                .map(b => `${b.name} (${b.role})`)
                .join(", "),
            humanPlayerName: game.humanPlayerName,
            day_activity_data: formatDayActivityData(game)
        });

        const gmAgent = AgentFactory.createAgent(GAME_MASTER, gmPrompt, game.gameMasterAiType, apiKeys, false);
        const gmMessage: GameMessage = {
            id: null,
            recipientName: GAME_MASTER,
            authorName: GAME_MASTER,
            msg: GM_COMMAND_SELECT_RESPONDERS,
            messageType: MessageType.GM_COMMAND,
            day: game.currentDay,
            timestamp: Date.now()
        };

        // Include recent conversation in the GM's history for bot selection
        const history = convertToAIMessages(GAME_MASTER, [...dayMessages, gmMessage]);
        const [gmResponse, thinking] = await gmAgent.askWithZodSchema(GmBotSelectionZodSchema, history);
        if (!gmResponse) {
            throw new BotResponseError(
                'Game Master failed to select responding bots',
                'GM did not respond to bot selection request',
                { gmAiType: game.gameMasterAiType, action: 'bot_selection' },
                true
            );
        }
        if (!gmResponse.selected_bots || !Array.isArray(gmResponse.selected_bots)) {
            throw new BotResponseError(
                'Game Master provided invalid bot selection',
                'GM response format was invalid or missing selected_bots array',
                { gmAiType: game.gameMasterAiType, response: gmResponse },
                true
            );
        }

        // Update game state with selected bots queue (limit to 1-3 bots as requested)
        const selectedBots = gmResponse.selected_bots.slice(0, 3);
        
        await db.collection('games').doc(gameId).update({
            gameStateProcessQueue: selectedBots
        });

        // Return updated game state
        return await getGame(gameId) as Game;
    } catch (error) {
        console.error('Error in keepBotsGoing function:', error);
        throw error;
    }
}

/**
 * Handle the case when a human player initiates a discussion.
 * Saves the human message and selects bots to respond.
 * @private
 */
async function handleHumanPlayerMessage(
    gameId: string,
    game: Game,
    userMessage: string,
    userEmail: string
): Promise<void> {
    // Save the user's message to chat
    const userChatMessage: GameMessage = {
        id: null,
        recipientName: RECIPIENT_ALL,
        authorName: game.humanPlayerName,
        msg: userMessage,
        messageType: MessageType.HUMAN_PLAYER_MESSAGE,
        day: game.currentDay,
        timestamp: Date.now()
    };

    // Get all messages for the current day
    const messages = await getGameMessages(gameId);
    const dayMessages = messages.filter(m => m.day === game.currentDay);

    // Ask GM which bots should respond
    const apiKeys = await getUserFromFirestore(userEmail).then((user) => getUserApiKeys(user!.email));

    // Ensure day activity counter is initialized for backward compatibility
    await ensureDayActivityCounter(gameId);

    // Use existing activity counter - it's maintained incrementally and only recalculated after resets
    const gmPrompt = format(GM_ROUTER_SYSTEM_PROMPT, {
        players_names: [
            ...game.bots.map(b => b.name),
            game.humanPlayerName
        ].join(", "),
        dead_players_names_with_roles: game.bots
            .filter(b => !b.isAlive)
            .map(b => `${b.name} (${b.role})`)
            .join(", "),
        humanPlayerName: game.humanPlayerName,
        day_activity_data: formatDayActivityData(game)
    });

    const gmAgent = AgentFactory.createAgent(GAME_MASTER, gmPrompt, game.gameMasterAiType, apiKeys, false);
    const gmMessage: GameMessage = {
        id: null,
        recipientName: GAME_MASTER,
        authorName: GAME_MASTER,
        msg: GM_COMMAND_SELECT_RESPONDERS,
        messageType: MessageType.GM_COMMAND,
        day: game.currentDay,
        timestamp: Date.now()
    };

    // Include the user's message in the GM's history for bot selection
    const history = convertToAIMessages(GAME_MASTER, [...dayMessages, userChatMessage, gmMessage]);
    const [gmResponse, thinking] = await gmAgent.askWithZodSchema(GmBotSelectionZodSchema, history);
    if (!gmResponse) {
        throw new BotResponseError(
            'Game Master failed to select responding bots',
            'GM did not respond to bot selection request',
            { gmAiType: game.gameMasterAiType, action: 'bot_selection' },
            true
        );
    }
    if (!gmResponse.selected_bots || !Array.isArray(gmResponse.selected_bots)) {
        throw new BotResponseError(
            'Game Master provided invalid bot selection',
            'GM response format was invalid or missing selected_bots array',
            { gmAiType: game.gameMasterAiType, response: gmResponse },
            true
        );
    }

    // Save the user's message to the database after successful GM response
    await addMessageToChatAndSaveToDb(userChatMessage, gameId);

    // Update game state with selected bots queue
    if (!db) {
        throw new Error('Firestore is not initialized');
    }
    await db.collection('games').doc(gameId).update({
        gameStateProcessQueue: gmResponse.selected_bots
    });
}

/**
 * Process the next bot in the queue to generate a response.
 * @private
 */
async function processNextBotInQueue(
    gameId: string,
    game: Game,
    userEmail: string
): Promise<void> {
    // Get the first bot from queue
    const botName = game.gameStateProcessQueue[0];
    const newQueue = game.gameStateProcessQueue.slice(1);
    if (botName === game.humanPlayerName) {
        // Update queue
        if (!db) {
            throw new Error('Firestore is not initialized');
        }
        await db.collection('games').doc(gameId).update({
            gameStateProcessQueue: newQueue
        });
        return;
    }

    // Find the bot
    const bot = game.bots.find(b => b.name === botName);
    if (!bot) {
        throw new Error(`Bot ${botName} not found in game`);
    }

    // Create the game master command message
    const gmMessage: GameMessage = {
        id: null,
        recipientName: bot.name,
        authorName: GAME_MASTER,
        msg: format(GM_COMMAND_REPLY_TO_DISCUSSION, { bot_name: bot.name }),
        messageType: MessageType.GM_COMMAND,
        day: game.currentDay,
        timestamp: Date.now()
    };

    // Get messages for this bot (ALL + direct) using the optimized query
    const botMessages = await getBotMessages(gameId, bot.name, game.currentDay);

    // Get bot's response
    const apiKeys = await getUserFromFirestore(userEmail)
        .then((user) => getUserApiKeys(user!.email));

    const botPrompt = format(BOT_SYSTEM_PROMPT, {
        name: bot.name,
        personal_story: bot.story,
        play_style: "",
        role: bot.role,
        werewolf_teammates_section: generateWerewolfTeammatesSection(bot, game),
        players_names: [
            ...game.bots
                .filter(b => b.name !== bot.name)
                .map(b => b.name),
            game.humanPlayerName
        ].join(", "),
        dead_players_names_with_roles: game.bots
            .filter(b => !b.isAlive)
            .map(b => `${b.name} (${b.role})`)
            .join(", "),
        previous_day_summaries: generatePreviousDaySummariesSection(bot, game.currentDay)
    });

    const agent = AgentFactory.createAgent(bot.name, botPrompt, bot.aiType, apiKeys, false);
    // Include the GM command in history with playstyle reminder without saving it yet
    const playStyleReminder = format(BOT_REMINDER_POSTFIX, { play_style: generatePlayStyleDescription(bot) });
    const messagesWithPlaystyle = [...botMessages, {
        ...gmMessage,
        msg: gmMessage.msg + playStyleReminder
    }];
    const history = convertToAIMessages(bot.name, messagesWithPlaystyle);
    const [botReply, thinking] = await agent.askWithZodSchema(BotAnswerZodSchema, history);
    if (!botReply) {
        throw new BotResponseError(
            'Bot failed to respond to discussion',
            `Bot ${bot.name} did not respond to discussion prompt`,
            { botName: bot.name, aiType: bot.aiType, action: 'discussion_reply' },
            true
        );
    }
    const botMessage: GameMessage = {
        id: null,
        recipientName: RECIPIENT_ALL,
        authorName: bot.name,
        msg: { reply: botReply.reply, thinking: thinking || "" },
        messageType: MessageType.BOT_ANSWER,
        day: game.currentDay,
        timestamp: Date.now()
    };

    // Save the game master command to the database first
    await addMessageToChatAndSaveToDb(gmMessage, gameId);
    
    // Then save the bot's response
    await addMessageToChatAndSaveToDb(botMessage, gameId);

    // Increment day activity counter for the bot
    await incrementDayActivity(gameId, bot.name, game.currentDay);

    // Update queue
    if (!db) {
        throw new Error('Firestore is not initialized');
    }
    await db.collection('games').doc(gameId).update({
        gameStateProcessQueue: newQueue
    });
}

async function voteImpl(gameId: string): Promise<Game> {
    const session = await auth();
    if (!session || !session.user?.email) {
        throw new Error('Not authenticated');
    }
    if (!db) {
        throw new Error('Firestore is not initialized');
    }
    
    const game = await getGame(gameId);
    if (!game) {
        throw new Error('Game not found');
    }

    console.log('🔍 VOTE FUNCTION CALLED:', {
        gameId,
        gameState: game.gameState,
        queueLength: game.gameStateProcessQueue.length,
        queue: game.gameStateProcessQueue,
        timestamp: new Date().toISOString(),
        userEmail: session.user.email
    });

    try {
        // Mode 1: DAY_DISCUSSION state - Initialize voting
        if (game.gameState === GAME_STATES.DAY_DISCUSSION) {
            // Clean the queues
            const gameStateProcessQueue: string[] = [];
            const gameStateParamQueue: string[] = [];
            
            // Get all alive bot players
            const aliveBots = game.bots.filter(bot => bot.isAlive).map(bot => bot.name);
            
            // Add human player name
            const allPlayers = [...aliveBots, game.humanPlayerName];
            
            // Shuffle the list
            const shuffledPlayers = [...allPlayers].sort(() => Math.random() - 0.5);
            
            // Update game state
            await db.collection('games').doc(gameId).update({
                gameState: GAME_STATES.VOTE,
                gameStateProcessQueue: shuffledPlayers,
                gameStateParamQueue: gameStateParamQueue
            });
            
            return await getGame(gameId) as Game;
        }
        
        // Mode 2: VOTE state - Process voting
        else if (game.gameState === GAME_STATES.VOTE) {
            // Check if queue is empty
            if (game.gameStateProcessQueue.length === 0) {
                console.log('🎯 VOTE FUNCTION: Empty queue detected, transitioning to VOTE_RESULTS:', {
                    gameId,
                    gameState: game.gameState,
                    queueLength: game.gameStateProcessQueue.length,
                    timestamp: new Date().toISOString()
                });
                
                // Transition to VOTE_RESULTS state
                await db.collection('games').doc(gameId).update({
                    gameState: GAME_STATES.VOTE_RESULTS
                });
                
                console.log('✅ VOTE FUNCTION: Successfully updated game state to VOTE_RESULTS');
                
                // Get updated game state
                const updatedGame = await getGame(gameId) as Game;
                
                // Parse voting results
                let votingResults: Record<string, number> = {};
                if (updatedGame.gameStateParamQueue.length > 0) {
                    try {
                        votingResults = JSON.parse(updatedGame.gameStateParamQueue[0]);
                        console.log('📊 VOTE FUNCTION: Parsed voting results:', votingResults);
                    } catch (e) {
                        console.error("Failed to parse voting results", e);
                    }
                }
                
                // Generate GM message with voting results
                const resultsMessage = generateVotingResultsMessage(votingResults);
                console.log('📝 VOTE FUNCTION: Generated results message:', resultsMessage);
                
                // Create and save GM message
                const gmMessage: GameMessage = {
                    id: null, // Will be generated by Firestore
                    recipientName: RECIPIENT_ALL,
                    authorName: GAME_MASTER,
                    msg: { story: resultsMessage },
                    messageType: MessageType.GAME_STORY,
                    day: updatedGame.currentDay,
                    timestamp: Date.now(),
                };
                await addMessageToChatAndSaveToDb(gmMessage, gameId);
                
                console.log('✅ VOTE FUNCTION: Successfully saved GM results message');
                
                // ELIMINATION LOGIC: Process elimination after everyone has voted
                if (Object.keys(votingResults).length > 0) {
                    const maxVotes = Math.max(...Object.values(votingResults));
                    const topPlayers = Object.entries(votingResults)
                        .filter(([_, count]) => count === maxVotes)
                        .map(([name]) => name);
                    
                    let eliminatedPlayer: string;
                    let eliminatedRole: string;
                    let isHumanEliminated = false;
                    
                    if (topPlayers.length === 1) {
                        // Single player with most votes
                        eliminatedPlayer = topPlayers[0];
                    } else {
                        // Handle tie: randomly select from tied players, but exclude human if they're tied
                        const nonHumanTiedPlayers = topPlayers.filter(name => name !== updatedGame.humanPlayerName);
                        if (nonHumanTiedPlayers.length > 0) {
                            // Select randomly from non-human tied players
                            eliminatedPlayer = nonHumanTiedPlayers[Math.floor(Math.random() * nonHumanTiedPlayers.length)];
                        } else {
                            // All tied players are human (shouldn't happen with multiple players, but handle edge case)
                            eliminatedPlayer = topPlayers[0];
                        }
                    }
                    
                    // Determine if eliminated player is human
                    if (eliminatedPlayer === updatedGame.humanPlayerName) {
                        isHumanEliminated = true;
                        eliminatedRole = updatedGame.humanPlayerRole;
                    } else {
                        // Find the bot and get their role
                        const eliminatedBot = updatedGame.bots.find(bot => bot.name === eliminatedPlayer);
                        if (eliminatedBot) {
                            eliminatedRole = eliminatedBot.role;
                        } else {
                            console.error(`Could not find eliminated player: ${eliminatedPlayer}`);
                            eliminatedRole = 'unknown';
                        }
                    }
                    
                    // Generate elimination message
                    const eliminationMessage = generateEliminationMessage(eliminatedPlayer, eliminatedRole);
                    
                    // Create and save elimination message
                    const eliminationGmMessage: GameMessage = {
                        id: null,
                        recipientName: RECIPIENT_ALL,
                        authorName: GAME_MASTER,
                        msg: { story: eliminationMessage },
                        messageType: MessageType.GAME_STORY,
                        day: updatedGame.currentDay,
                        timestamp: Date.now(),
                    };
                    await addMessageToChatAndSaveToDb(eliminationGmMessage, gameId);
                    
                    // Update game state based on elimination
                    if (isHumanEliminated) {
                        // Human eliminated: set game state to GAME_OVER
                        await db.collection('games').doc(gameId).update({
                            gameState: GAME_STATES.GAME_OVER
                        });
                        console.log('🎮 ELIMINATION: Human player eliminated, game over');
                    } else {
                        // Bot eliminated: set Bot.isAlive = false and track elimination day
                        const updatedBots = updatedGame.bots.map(bot =>
                            bot.name === eliminatedPlayer
                                ? { ...bot, isAlive: false, eliminationDay: updatedGame.currentDay }
                                : bot
                        );
                        
                        await db.collection('games').doc(gameId).update({
                            bots: updatedBots
                        });
                        console.log(`🤖 ELIMINATION: Bot ${eliminatedPlayer} eliminated`);
                        
                        // Check for game end conditions after updating bots
                        const tempGame = { ...updatedGame, bots: updatedBots };
                        const endCheck = checkGameEndConditions(tempGame);
                        
                        if (endCheck.isEnded) {
                            console.log(`🎮 GAME END: ${endCheck.reason}`);
                            
                            // Create game end message
                            const gameEndMessage: GameMessage = {
                                id: null,
                                recipientName: RECIPIENT_ALL,
                                authorName: GAME_MASTER,
                                msg: { story: endCheck.reason || 'Game has ended!' },
                                messageType: MessageType.GAME_STORY,
                                day: updatedGame.currentDay,
                                timestamp: Date.now(),
                            };
                            await addMessageToChatAndSaveToDb(gameEndMessage, gameId);
                            
                            // Update game state to GAME_OVER
                            await db.collection('games').doc(gameId).update({
                                gameState: GAME_STATES.GAME_OVER
                            });
                        }
                    }
                    
                    console.log('✅ ELIMINATION: Successfully processed elimination logic');
                }
                
                // Get final updated game state
                const finalGame = await getGame(gameId) as Game;
                console.log('✅ VOTE FUNCTION: Successfully completed voting and elimination, returning final game');
                return finalGame;
            }
            
            // Get the first name from queue
            const currentVoter = game.gameStateProcessQueue[0];
            
            // If it's the human player, return to UI (UI will handle human voting)
            if (currentVoter === game.humanPlayerName) {
                return game;
            }
            
            // Find the bot
            const bot = game.bots.find(b => b.name === currentVoter);
            if (!bot) {
                throw new Error(`Bot ${currentVoter} not found in game`);
            }
            
            // Process the bot's vote using simple sequential operations
            console.log(`Processing vote for bot ${bot.name}`);
            
            // Get current game state
            const currentGame = await getGame(gameId) as Game;
            
            // Idempotency check: Verify this bot is still in the queue
            if (!currentGame.gameStateProcessQueue.includes(currentVoter)) {
                console.log(`Bot ${currentVoter} already processed, skipping`);
                return currentGame;
            }
            
            // Validate game state hasn't changed
            if (currentGame.gameState !== GAME_STATES.VOTE) {
                throw new Error(`Game state changed during processing: ${currentGame.gameState}`);
            }
            
            // Get all alive players for voting options
            const alivePlayerNames = [
                ...currentGame.bots.filter(b => b.isAlive && b.name !== bot.name).map(b => b.name),
                currentGame.humanPlayerName
            ];
            
            if (alivePlayerNames.length === 0) {
                throw new Error('No valid voting targets available');
            }
            
            // Get API keys and create bot agent
            const apiKeys = await getUserFromFirestore(session.user!.email!)
                .then((user) => getUserApiKeys(user!.email));
            
            const botPrompt = format(
                BOT_SYSTEM_PROMPT,
                {
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
                }
            );
            
            const agent = AgentFactory.createAgent(bot.name, botPrompt, bot.aiType, apiKeys, false);
            
            // Create the voting command message
            const gmMessage: GameMessage = {
                id: null,
                recipientName: bot.name,
                authorName: GAME_MASTER,
                msg: format(BOT_VOTE_PROMPT, { bot_name: bot.name }),
                messageType: MessageType.GM_COMMAND,
                day: currentGame.currentDay,
                timestamp: Date.now()
            };
            
            // Get messages for this bot
            const botMessages = await getBotMessages(gameId, bot.name, currentGame.currentDay);
            
            // Create history including the voting command with playstyle reminder
            const playStyleReminder = format(BOT_REMINDER_POSTFIX, { play_style: generatePlayStyleDescription(bot) });
            const messagesWithPlaystyle = [...botMessages, {
                ...gmMessage,
                msg: gmMessage.msg + playStyleReminder
            }];
            const history = convertToAIMessages(bot.name, messagesWithPlaystyle);
            
            let voteResponse: any;
            let thinking: string;
            try {
                [voteResponse, thinking] = await agent.askWithZodSchema(BotVoteZodSchema, history);
            } catch (error) {
                // Handle specific model errors by using their message
                if (error instanceof ModelError) {
                    throw new BotResponseError(
                        error.message, // Use the error's message directly
                        `Bot ${bot.name} (${bot.aiType}) encountered an error during voting`,
                        { botName: bot.name, aiType: bot.aiType, action: 'vote', originalError: error.constructor.name },
                        true
                    );
                }
                // Re-throw other errors as-is
                throw error;
            }
            
            if (!voteResponse) {
                throw new BotResponseError(
                    'Bot failed to cast vote',
                    `Bot ${bot.name} did not respond to voting prompt`,
                    { botName: bot.name, aiType: bot.aiType, action: 'vote' },
                    true
                );
            }
            
            // Validate the vote target is alive and valid
            if (!alivePlayerNames.includes(voteResponse.who)) {
                throw new BotResponseError(
                    `Invalid vote target: ${voteResponse.who}`,
                    `Bot ${bot.name} attempted to vote for an invalid target. Valid targets: ${alivePlayerNames.join(', ')}`,
                    { botName: bot.name, aiType: bot.aiType, action: 'vote', invalidTarget: voteResponse.who },
                    true
                );
            }
            
            // Update voting results in gameStateParamQueue (as a map of names to vote counts)
            let votingResults: Record<string, number> = {};
            if (currentGame.gameStateParamQueue.length > 0) {
                try {
                    votingResults = JSON.parse(currentGame.gameStateParamQueue[0]);
                } catch (e) {
                    votingResults = {};
                }
            }
            
            // Add this vote
            votingResults[voteResponse.who] = (votingResults[voteResponse.who] || 0) + 1;
            
            // Save the vote as a message
            const voteMessage: GameMessage = {
                id: null,
                recipientName: RECIPIENT_ALL,
                authorName: bot.name,
                msg: {
                    who: voteResponse.who,
                    why: voteResponse.why
                },
                messageType: MessageType.VOTE_MESSAGE,
                day: currentGame.currentDay,
                timestamp: Date.now()
            };
            
            // Save messages to database sequentially
            await addMessageToChatAndSaveToDb(gmMessage, gameId);
            await addMessageToChatAndSaveToDb(voteMessage, gameId);
            
            // Remove the bot from queue and update voting results
            const newQueue = currentGame.gameStateProcessQueue.slice(1);
            
            await db.collection('games').doc(gameId).update({
                gameStateProcessQueue: newQueue,
                gameStateParamQueue: [JSON.stringify(votingResults)]
            });
            
            console.log(`Successfully processed vote for bot ${bot.name}, removed from queue`);
            
            // Return updated game state
            return await getGame(gameId) as Game;
        }
        
        else {
            console.error('🚨 INVALID GAME STATE FOR VOTING:', {
                gameId,
                currentGameState: game.gameState,
                validStates: [GAME_STATES.DAY_DISCUSSION, GAME_STATES.VOTE],
                queueLength: game.gameStateProcessQueue.length,
                queue: game.gameStateProcessQueue,
                timestamp: new Date().toISOString(),
                userEmail: session.user.email,
                stackTrace: new Error().stack
            });
            throw new Error(`Invalid game state for voting: ${game.gameState}`);
        }
    } catch (error) {
        console.error('Error in vote function:', error);
        throw error;
    }
}

async function humanPlayerVoteImpl(gameId: string, targetPlayer: string, reason: string): Promise<Game> {
    const session = await auth();
    if (!session || !session.user?.email) {
        throw new Error('Not authenticated');
    }
    if (!db) {
        throw new Error('Firestore is not initialized');
    }

    const game = await getGame(gameId);
    if (!game) {
        throw new Error('Game not found');
    }

    // Validate game state
    if (game.gameState !== GAME_STATES.VOTE) {
        throw new Error('Game is not in voting phase');
    }

    // Check if it's the human player's turn to vote
    if (game.gameStateProcessQueue.length === 0 || game.gameStateProcessQueue[0] !== game.humanPlayerName) {
        throw new Error('Not your turn to vote');
    }

    // Validate target player is alive and not the human player
    const alivePlayerNames = game.bots.filter(b => b.isAlive).map(b => b.name);
    if (!alivePlayerNames.includes(targetPlayer)) {
        throw new Error('Invalid target player');
    }

    try {
        console.log(`Processing vote for human player ${game.humanPlayerName}`);
        
        // Re-read current game state to ensure consistency
        const currentGame = await getGame(gameId);
        if (!currentGame) {
            throw new Error('Game not found');
        }
        
        // Verify human player is still in the queue
        if (!currentGame.gameStateProcessQueue.includes(currentGame.humanPlayerName)) {
            throw new Error('Human player already voted');
        }
        
        // Validate game state hasn't changed
        if (currentGame.gameState !== GAME_STATES.VOTE) {
            throw new Error(`Game state changed during processing: ${currentGame.gameState}`);
        }
        
        // Update voting results in gameStateParamQueue
        let votingResults: Record<string, number> = {};
        if (currentGame.gameStateParamQueue.length > 0) {
            try {
                votingResults = JSON.parse(currentGame.gameStateParamQueue[0]);
            } catch (e) {
                votingResults = {};
            }
        }
        
        // Add this vote
        votingResults[targetPlayer] = (votingResults[targetPlayer] || 0) + 1;
        
        // Create the vote message
        const voteMessage: GameMessage = {
            id: null,
            recipientName: RECIPIENT_ALL,
            authorName: currentGame.humanPlayerName,
            msg: {
                who: targetPlayer,
                why: reason
            },
            messageType: MessageType.VOTE_MESSAGE,
            day: currentGame.currentDay,
            timestamp: Date.now()
        };
        
        // Save vote message to database using the existing helper function
        await addMessageToChatAndSaveToDb(voteMessage, gameId);
        
        // Remove the human player from queue and update voting results
        const newQueue = currentGame.gameStateProcessQueue.slice(1);
        
        const gameRef = db.collection('games').doc(gameId);
        await gameRef.update({
            gameStateProcessQueue: newQueue,
            gameStateParamQueue: [JSON.stringify(votingResults)]
        });
        
        console.log(`Successfully processed vote for human player ${currentGame.humanPlayerName}, removed from queue`);
        
        // Return updated game state
        return {
            ...currentGame,
            gameStateProcessQueue: newQueue,
            gameStateParamQueue: [JSON.stringify(votingResults)]
        };
    } catch (error) {
        console.error('Error in humanPlayerVote function:', error);
        throw error;
    }
}

/**
 * Handles human player's final night action (werewolf, doctor, or detective)
 * NEW LOGIC: This function is only called when human player is the last in gameStateParamQueue
 * and needs to make the final target decision for their role
 */
async function performHumanPlayerNightActionImpl(gameId: string, targetPlayer: string, message: string): Promise<Game> {
    const session = await auth();
    if (!session || !session.user?.email) {
        throw new Error('Not authenticated');
    }
    if (!db) {
        throw new Error('Firestore is not initialized');
    }

    const game = await getGame(gameId);
    if (!game) {
        throw new Error('Game not found');
    }

    // Validate game state
    if (game.gameState !== GAME_STATES.NIGHT) {
        throw new Error('Game is not in night phase');
    }

    // Check if it's the human player's turn for night action
    if (game.gameStateProcessQueue.length === 0 || game.gameStateParamQueue.length === 0) {
        throw new Error('No night actions in progress');
    }

    const currentRole = game.gameStateProcessQueue[0];
    const currentPlayer = game.gameStateParamQueue[0];

    if (currentRole !== game.humanPlayerRole || currentPlayer !== game.humanPlayerName) {
        throw new Error('Not your turn for night action');
    }

    // NEW LOGIC: This function should only be called when human is the last in queue (final action)
    if (game.gameStateParamQueue.length !== 1) {
        throw new Error('Use humanPlayerTalkWerewolves for werewolf coordination phase');
    }

    // Validate target player based on role-specific rules
    const allPlayers = [
        { name: game.humanPlayerName, isAlive: true },
        ...game.bots.map(bot => ({ name: bot.name, isAlive: bot.isAlive }))
    ];
    const alivePlayerNames = allPlayers.filter(p => p.isAlive).map(p => p.name);
    
    // Role-specific target validation
    if (currentRole === GAME_ROLES.WEREWOLF) {
        // Werewolves cannot target other werewolves
        const werewolfNames = [
            game.humanPlayerRole === GAME_ROLES.WEREWOLF ? game.humanPlayerName : null,
            ...game.bots.filter(bot => bot.isAlive && bot.role === GAME_ROLES.WEREWOLF).map(bot => bot.name)
        ].filter(name => name !== null);
        
        const validTargets = alivePlayerNames.filter(name => !werewolfNames.includes(name));
        if (!validTargets.includes(targetPlayer)) {
            throw new Error(`Invalid werewolf target. Available targets: ${validTargets.join(', ')}`);
        }
    } else if (currentRole === GAME_ROLES.DOCTOR) {
        // Doctor cannot protect the same player two nights in a row
        const previousProtectedTarget = game.previousNightResults?.doctor?.target || null;
        const validTargets = previousProtectedTarget 
            ? alivePlayerNames.filter(name => name !== previousProtectedTarget)
            : alivePlayerNames;
            
        if (!validTargets.includes(targetPlayer)) {
            if (targetPlayer === previousProtectedTarget) {
                throw new Error(`Cannot protect ${targetPlayer} again - you protected them last night. Available targets: ${validTargets.join(', ')}`);
            } else {
                throw new Error(`Invalid doctor target. Available targets: ${validTargets.join(', ')}`);
            }
        }
    } else {
        // Detective and other roles can target any alive player
        if (!alivePlayerNames.includes(targetPlayer)) {
            throw new Error(`Invalid target. Available targets: ${alivePlayerNames.join(', ')}`);
        }
    }

    try {
        // Determine recipient and message type based on role
        let recipient: string;
        let messageType: MessageType;
        
        if (currentRole === GAME_ROLES.WEREWOLF) {
            recipient = RECIPIENT_WEREWOLVES;
            messageType = MessageType.WEREWOLF_ACTION;
        } else if (currentRole === GAME_ROLES.DOCTOR) {
            recipient = RECIPIENT_DOCTOR;
            messageType = MessageType.DOCTOR_ACTION;
        } else if (currentRole === GAME_ROLES.DETECTIVE) {
            recipient = RECIPIENT_DETECTIVE;
            messageType = MessageType.DETECTIVE_ACTION;
        } else {
            // Fallback for other roles
            recipient = RECIPIENT_ALL;
            messageType = MessageType.BOT_ANSWER;
        }

        // Create the night action message with final target decision
        const nightActionMessage: GameMessage = {
            id: null,
            recipientName: recipient,
            authorName: game.humanPlayerName,
            msg: { target: targetPlayer, reasoning: message },
            messageType: messageType,
            day: game.currentDay,
            timestamp: Date.now()
        };
        
        // Save night action message to database
        await addMessageToChatAndSaveToDb(nightActionMessage, gameId);
        
        // Update night results with the target
        const updatedNightResults = {
            ...(game.nightResults || {}),
            [currentRole]: { target: targetPlayer }
        };
        
        // Remove current player from param queue (should make it empty)
        const newParamQueue = game.gameStateParamQueue.slice(1);
        
        // Since this was the last player, move to next role or end night
        let finalUpdates: any = {
            gameStateParamQueue: newParamQueue,
            nightResults: updatedNightResults
        };

        if (newParamQueue.length === 0) {
            // Current role finished, move to next role or end night
            const newProcessQueue = game.gameStateProcessQueue.slice(1);
            finalUpdates.gameStateProcessQueue = newProcessQueue;

            if (newProcessQueue.length > 0) {
                // Move to next role - import populateParamQueueForRole logic
                const nextRole = newProcessQueue[0];
                const playersWithRole: string[] = [];
                
                // Check bots for next role
                game.bots
                    .filter(bot => bot.isAlive && bot.role === nextRole)
                    .forEach(bot => playersWithRole.push(bot.name));
                
                // Check human player for next role
                if (game.humanPlayerRole === nextRole) {
                    playersWithRole.push(game.humanPlayerName);
                }
                
                // For werewolves, duplicate the list if multiple werewolves exist (for coordination phase)
                let nextParamQueue: string[] = [];
                if (nextRole === GAME_ROLES.WEREWOLF && playersWithRole.length > 1) {
                    nextParamQueue = [...playersWithRole, ...playersWithRole];
                } else {
                    nextParamQueue = [...playersWithRole];
                }
                
                // Randomize the order
                finalUpdates.gameStateParamQueue = nextParamQueue.sort(() => Math.random() - 0.5);
            } else {
                // No more roles, keep NIGHT state but with empty queues
                // The frontend will detect this and trigger night summary generation
                // Don't set NIGHT_ENDS here - let endNightWithResults in night-actions.ts handle it
            }
        }
        
        // Update game state
        await db.collection('games').doc(gameId).update(finalUpdates);
        
        console.log(`Successfully processed final night action for human player ${game.humanPlayerName} targeting ${targetPlayer}`);
        
        // Return updated game state
        return await getGame(gameId) as Game;
    } catch (error) {
        console.error('Error in performHumanPlayerNightAction function:', error);
        throw error;
    }
}

async function getSuggestionImpl(gameId: string): Promise<string> {
    const session = await auth();
    if (!session || !session.user?.email) {
        throw new Error('Not authenticated');
    }
    if (!db) {
        throw new Error('Firestore is not initialized');
    }

    const game = await getGame(gameId);
    if (!game) {
        throw new Error('Game not found');
    }

    // Validate game state
    if (game.gameState !== GAME_STATES.DAY_DISCUSSION) {
        throw new Error('Suggestions are only available during day discussion');
    }

    try {
        // Get all messages for the current day to provide context
        const messages = await getGameMessages(gameId);
        const dayMessages = messages.filter(m => m.day === game.currentDay);

        // Get API keys for the human player
        const apiKeys = await getUserFromFirestore(session.user.email)
            .then((user) => getUserApiKeys(user!.email));

        // Create prompt with game context
        const suggestionPrompt = format(HUMAN_SUGGESTION_PROMPT, {
            player_name: game.humanPlayerName,
            players_names: [
                ...game.bots.map(b => b.name),
                game.humanPlayerName
            ].join(", "),
            dead_players_names_with_roles: game.bots
                .filter(b => !b.isAlive)
                .map(b => `${b.name} (${b.role})`)
                .join(", ")
        });

        // Use the game master AI to generate suggestion
        const agent = AgentFactory.createAgent('SuggestionBot', suggestionPrompt, game.gameMasterAiType, apiKeys, false);
        
        // Convert day messages to AI format for context
        const history = convertToAIMessages('SuggestionBot', dayMessages);
        
        // Get suggestion from AI using schema to ensure consistent format
        const [suggestionResponse, thinking] = await agent.askWithZodSchema(BotAnswerZodSchema, history);
        
        if (!suggestionResponse) {
            throw new Error('Failed to generate suggestion');
        }

        // Extract the reply text
        return suggestionResponse.reply.trim();
    } catch (error) {
        console.error('Error in getSuggestion function:', error);
        throw error;
    }
}

// Wrapped exports with error handling
export const welcome = withGameErrorHandling(welcomeImpl);
export const talkToAll = withGameErrorHandling(talkToAllImpl);
export const keepBotsGoing = withGameErrorHandling(keepBotsGoingImpl);
export const vote = withGameErrorHandling(voteImpl);
export const humanPlayerVote = withGameErrorHandling(humanPlayerVoteImpl);
export const performHumanPlayerNightAction = withGameErrorHandling(performHumanPlayerNightActionImpl);
export const getSuggestion = withGameErrorHandling(getSuggestionImpl);