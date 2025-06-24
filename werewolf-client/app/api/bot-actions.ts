'use server';

import {db} from "@/firebase/server";
import {
    Bot,
    BotAnswer,
    BotResponseError,
    Game,
    GAME_MASTER,
    GAME_STATES,
    GameMessage,
    MessageType,
    PLAY_STYLES,
    PLAY_STYLE_CONFIGS,
    RECIPIENT_ALL
} from "@/app/api/game-models";
import {
    GM_COMMAND_INTRODUCE_YOURSELF,
    GM_COMMAND_REPLY_TO_DISCUSSION,
    GM_COMMAND_SELECT_RESPONDERS
} from "@/app/ai/prompts/gm-commands";
import {BOT_SYSTEM_PROMPT, BOT_VOTE_PROMPT} from "@/app/ai/prompts/bot-prompts";
import {GM_ROUTER_SYSTEM_PROMPT} from "@/app/ai/prompts/gm-prompts";
import {createBotAnswerSchema, createBotVoteSchema, createGmBotSelectionSchema} from "@/app/ai/prompts/ai-schemas";
import {AgentFactory} from "@/app/ai/agent-factory";
import {format} from "@/app/ai/prompts/utils";
import {auth} from "@/auth";
import {
    convertToAIMessages,
    generateEliminationMessage,
    generateVotingResultsMessage,
    parseResponseToObj
} from "@/app/utils/message-utils";
import {
    addMessageToChatAndSaveToDb,
    getBotMessages,
    getGame,
    getGameMessages,
    getUserFromFirestore
} from "./game-actions";
import {getUserApiKeys} from "./user-actions";
import {withGameErrorHandling} from "@/app/utils/server-action-wrapper";

/**
 * Generates the play style description for a bot, including special parameters for suspicious style
 */
function generatePlayStyleDescription(bot: Bot): string {
    const config = PLAY_STYLE_CONFIGS[bot.playStyle];
    if (!config) {
        return 'You have a balanced and thoughtful personality.';
    }
    
    let description = config.description;
    
    // For suspicious style, inject the specific target names if available
    if (bot.playStyle === PLAY_STYLES.SUSPICIOUS && bot.playStyleParams && bot.playStyleParams.length >= 2) {
        const [target1, target2] = bot.playStyleParams;
        description = `You are highly suspicious of ${target1} and ${target2} specifically. You believe they are werewolves and focus your suspicions on them throughout the game. ${description}`;
    }
    
    return description;
}

/**
 * Wraps Firestore operations in a transaction for atomicity
 * Ensures all game state updates are atomic and can be rolled back on errors
 */
async function processWithTransaction<T>(
    gameId: string,
    operation: (transaction: FirebaseFirestore.Transaction, gameRef: FirebaseFirestore.DocumentReference) => Promise<T>
): Promise<T> {
    if (!db) {
        throw new Error('Firestore is not initialized');
    }

    const gameRef = db.collection('games').doc(gameId);
    
    try {
        return await db.runTransaction(async (transaction) => {
            console.log(`Starting transaction for game ${gameId}`);
            const result = await operation(transaction, gameRef);
            console.log(`Transaction completed successfully for game ${gameId}`);
            return result;
        });
    } catch (error) {
        console.error(`Transaction failed for game ${gameId}:`, error);
        
        // Re-throw BotResponseError as-is for frontend handling
        if (error instanceof BotResponseError) {
            console.error('BotResponseError details:', {
                message: error.message,
                details: error.details,
                context: error.context,
                recoverable: error.recoverable
            });
            throw error;
        }
        
        // Wrap other errors in BotResponseError for consistent handling
        throw new BotResponseError(
            'System error occurred',
            error instanceof Error ? error.message : 'Unknown error',
            { originalError: error },
            false // System errors are typically not recoverable
        );
    }
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
                play_style: generatePlayStyleDescription(bot),
                role: bot.role,
                players_names: [
                    ...game.bots
                        .filter(b => b.name !== bot.name)
                        .map(b => b.name),
                    game.humanPlayerName
                ].join(", "),
                dead_players_names_with_roles: game.bots
                    .filter(b => !b.isAlive)
                    .map(b => `${b.name} (${b.role})`)
                    .join(", ")
            }
        );

        const agent = AgentFactory.createAgent(bot.name, botPrompt, bot.aiType, apiKeys);

        // Create the game master command message
        const gmMessage: GameMessage = {
            id: null,
            recipientName: bot.name,
            authorName: GAME_MASTER,
            msg: GM_COMMAND_INTRODUCE_YOURSELF,
            messageType: MessageType.GM_COMMAND,
            day: game.currentDay,
            timestamp: Date.now()
        };

        // Get messages for this bot (ALL + direct messages to this bot)
        const botMessages = await getBotMessages(gameId, bot.name, game.currentDay);

        // Create history from filtered messages, including the GM command that hasn't been saved yet
        const history = convertToAIMessages(bot.name, [...botMessages, gmMessage]);
        const schema = createBotAnswerSchema();
        
        const rawIntroduction = await agent.askWithSchema(schema, history);
        if (!rawIntroduction) {
            throw new BotResponseError(
                'Bot failed to provide introduction',
                `Bot ${bot.name} did not respond to introduction request`,
                { botName: bot.name, aiType: bot.aiType },
                true
            );
        }

        const answer = parseResponseToObj(rawIntroduction, 'BotAnswer');

        const botMessage: GameMessage = {
            id: null,
            recipientName: RECIPIENT_ALL,
            authorName: bot.name,
            msg: { reply: answer.reply },
            messageType: MessageType.BOT_ANSWER,
            day: game.currentDay,
            timestamp: Date.now()
        };

        // Save the game master command to the database first
        await addMessageToChatAndSaveToDb(gmMessage, gameId);
        
        // Then save the bot's response
        await addMessageToChatAndSaveToDb(botMessage, gameId);

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

        const gmPrompt = format(GM_ROUTER_SYSTEM_PROMPT, {
            players_names: [
                ...game.bots.map(b => b.name),
                game.humanPlayerName
            ].join(", "),
            dead_players_names_with_roles: game.bots
                .filter(b => !b.isAlive)
                .map(b => `${b.name} (${b.role})`)
                .join(", ")
        });

        const gmAgent = AgentFactory.createAgent(GAME_MASTER, gmPrompt, game.gameMasterAiType, apiKeys);
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
        const schema = createGmBotSelectionSchema();

        const rawGmResponse = await gmAgent.askWithSchema(schema, history);
        if (!rawGmResponse) {
            throw new BotResponseError(
                'Game Master failed to select responding bots',
                'GM did not respond to bot selection request',
                { gmAiType: game.gameMasterAiType, action: 'bot_selection' },
                true
            );
        }

        const gmResponse = parseResponseToObj(rawGmResponse);
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

    const gmPrompt = format(GM_ROUTER_SYSTEM_PROMPT, {
        players_names: [
            ...game.bots.map(b => b.name),
            game.humanPlayerName
        ].join(", "),
        dead_players_names_with_roles: game.bots
            .filter(b => !b.isAlive)
            .map(b => `${b.name} (${b.role})`)
            .join(", ")
    });

    const gmAgent = AgentFactory.createAgent(GAME_MASTER, gmPrompt, game.gameMasterAiType, apiKeys);
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
    const schema = createGmBotSelectionSchema();

    const rawGmResponse = await gmAgent.askWithSchema(schema, history);
    if (!rawGmResponse) {
        throw new BotResponseError(
            'Game Master failed to select responding bots',
            'GM did not respond to bot selection request',
            { gmAiType: game.gameMasterAiType, action: 'bot_selection' },
            true
        );
    }

    const gmResponse = parseResponseToObj(rawGmResponse);
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
        msg: GM_COMMAND_REPLY_TO_DISCUSSION,
        messageType: MessageType.GM_COMMAND,
        day: game.currentDay,
        timestamp: Date.now()
    };

    // Save the game master command to the database
    await addMessageToChatAndSaveToDb(gmMessage, gameId);

    // Get messages for this bot (ALL + direct) using the optimized query
    const botMessages = await getBotMessages(gameId, bot.name, game.currentDay);

    // Get bot's response
    const apiKeys = await getUserFromFirestore(userEmail)
        .then((user) => getUserApiKeys(user!.email));

    const botPrompt = format(BOT_SYSTEM_PROMPT, {
        name: bot.name,
        personal_story: bot.story,
        play_style: generatePlayStyleDescription(bot),
        role: bot.role,
        players_names: [
            ...game.bots
                .filter(b => b.name !== bot.name)
                .map(b => b.name),
            game.humanPlayerName
        ].join(", "),
        dead_players_names_with_roles: game.bots
            .filter(b => !b.isAlive)
            .map(b => `${b.name} (${b.role})`)
            .join(", ")
    });

    const agent = AgentFactory.createAgent(bot.name, botPrompt, bot.aiType, apiKeys);
    // Include the GM command in history without saving it yet
    const history = convertToAIMessages(bot.name, [...botMessages, gmMessage]);
    const schema = createBotAnswerSchema();
    
    const rawBotReply = await agent.askWithSchema(schema, history);
    if (!rawBotReply) {
        throw new BotResponseError(
            'Bot failed to respond to discussion',
            `Bot ${bot.name} did not respond to discussion prompt`,
            { botName: bot.name, aiType: bot.aiType, action: 'discussion_reply' },
            true
        );
    }

    const botReply = parseResponseToObj(rawBotReply, 'BotAnswer');
    const botMessage: GameMessage = {
        id: null,
        recipientName: RECIPIENT_ALL,
        authorName: bot.name,
        msg: { reply: botReply.reply },
        messageType: MessageType.BOT_ANSWER,
        day: game.currentDay,
        timestamp: Date.now()
    };

    // Save the game master command to the database first
    await addMessageToChatAndSaveToDb(gmMessage, gameId);
    
    // Then save the bot's response
    await addMessageToChatAndSaveToDb(botMessage, gameId);

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
                    play_style: generatePlayStyleDescription(bot),
                    role: bot.role,
                    players_names: [
                        ...currentGame.bots
                            .filter(b => b.name !== bot.name)
                            .map(b => b.name),
                        currentGame.humanPlayerName
                    ].join(", "),
                    dead_players_names_with_roles: currentGame.bots
                        .filter(b => !b.isAlive)
                        .map(b => `${b.name} (${b.role})`)
                        .join(", ")
                }
            );
            
            const agent = AgentFactory.createAgent(bot.name, botPrompt, bot.aiType, apiKeys);
            
            // Create the voting command message
            const gmMessage: GameMessage = {
                id: null,
                recipientName: bot.name,
                authorName: GAME_MASTER,
                msg: BOT_VOTE_PROMPT,
                messageType: MessageType.GM_COMMAND,
                day: currentGame.currentDay,
                timestamp: Date.now()
            };
            
            // Get messages for this bot
            const botMessages = await getBotMessages(gameId, bot.name, currentGame.currentDay);
            
            // Create history including the voting command
            const history = convertToAIMessages(bot.name, [...botMessages, gmMessage]);
            const schema = createBotVoteSchema();
            
            const rawVoteResponse = await agent.askWithSchema(schema, history);
            if (!rawVoteResponse) {
                throw new BotResponseError(
                    'Bot failed to cast vote',
                    `Bot ${bot.name} did not respond to voting prompt`,
                    { botName: bot.name, aiType: bot.aiType, action: 'vote' },
                    true
                );
            }
            
            const voteResponse = parseResponseToObj(rawVoteResponse, 'VoteMessage');
            
            // Validate the vote target is alive and valid
            if (!alivePlayerNames.includes(voteResponse.who)) {
                // If invalid target, vote for a random valid target
                voteResponse.who = alivePlayerNames[Math.floor(Math.random() * alivePlayerNames.length)];
                voteResponse.why = "Voting for a suspicious player";
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
        // Process the vote using a transaction for atomicity
        return await processWithTransaction(gameId, async (transaction, gameRef) => {
            console.log(`Processing vote for human player ${game.humanPlayerName}`);
            
            // Re-read game state within transaction to ensure consistency
            const gameDoc = await transaction.get(gameRef);
            if (!gameDoc.exists) {
                throw new Error('Game not found in transaction');
            }
            
            const currentGame = { id: gameDoc.id, ...gameDoc.data() } as Game;
            
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
            
            // Save vote message to database within transaction
            if (!db) {
                throw new Error('Firestore is not initialized');
            }
            const messagesRef = db.collection('games').doc(gameId).collection('messages');
            await transaction.create(messagesRef.doc(), {
                ...voteMessage,
                timestamp: Date.now()
            });
            
            // Remove the human player from queue and update voting results
            const newQueue = currentGame.gameStateProcessQueue.slice(1);
            
            transaction.update(gameRef, {
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
        });
    } catch (error) {
        console.error('Error in humanPlayerVote function:', error);
        throw error;
    }
}

// Wrapped exports with error handling
export const welcome = withGameErrorHandling(welcomeImpl);
export const talkToAll = withGameErrorHandling(talkToAllImpl);
export const keepBotsGoing = withGameErrorHandling(keepBotsGoingImpl);
export const vote = withGameErrorHandling(voteImpl);
export const humanPlayerVote = withGameErrorHandling(humanPlayerVoteImpl);