'use server';

import {db} from "@/firebase/server";
import {
    Game,
    GAME_STATES,
    BotResponseError,
    ROLE_CONFIGS,
    GAME_ROLES,
    GAME_MASTER,
    GameMessage,
    MessageType,
    RECIPIENT_ALL,
    RECIPIENT_WEREWOLVES,
    RECIPIENT_DOCTOR,
    RECIPIENT_DETECTIVE
} from "@/app/api/game-models";
import {auth} from "@/auth";
import {getGame, addMessageToChatAndSaveToDb} from "./game-actions";
import { RoleProcessorFactory } from "./roles";
import {withGameErrorHandling} from "@/app/utils/server-action-wrapper";
import { AgentFactory } from "@/app/ai/agent-factory";
import { getUserFromFirestore, getBotMessages } from "@/app/api/game-actions";
import { getApiKeysForUser } from "@/app/utils/tier-utils";
import { GM_NIGHT_RESULTS_SYSTEM_PROMPT } from "@/app/ai/prompts/gm-prompts";
import { GM_COMMAND_GENERATE_NIGHT_RESULTS } from "@/app/ai/prompts/gm-commands";
import { NightResultsStoryZodSchema, BotAnswerZodSchema } from "@/app/ai/prompts/zod-schemas";
import { NightResultsStory } from "@/app/ai/prompts/ai-schemas";
import { BOT_DAY_SUMMARY_PROMPT, BOT_SYSTEM_PROMPT } from "@/app/ai/prompts/bot-prompts";
import { generateWerewolfTeammatesSection, generatePreviousDaySummariesSection } from "@/app/utils/bot-utils";
import { format } from "@/app/ai/prompts/utils";
import { parseResponseToObj, convertToAIMessages } from "@/app/utils/message-utils";
import {checkGameEndConditions} from "@/app/utils/game-utils";
import {GameEndChecker} from "@/app/utils/game-end-checker";
import {recordBotTokenUsage, recordGameMasterTokenUsage} from "@/app/api/cost-tracking";
import {ensureUserCanAccessGame} from "@/app/api/tier-guards";

/**
 * Helper function to handle night end logic with results processing
 * @param gameId - The game ID
 * @param game - The current game state
 */
async function endNightWithResults(gameId: string, game: Game): Promise<Game> {
    if (!db) {
        throw new Error('Firestore is not initialized');
    }

    // Analyze night results to determine outcomes
    const nightResults = game.nightResults || {};
    
    // 1. Determine if werewolves succeeded in killing their target
    let killedPlayer: string | null = null;
    let killedPlayerRole: string | null = null;
    let wasKillPrevented = false;
    let noWerewolfActivity = false;
    
    if (nightResults.werewolf) {
        const werewolfTarget = nightResults.werewolf.target;
        const wasProtected = nightResults.doctor && nightResults.doctor.target === werewolfTarget;
        
        if (wasProtected) {
            wasKillPrevented = true;
        } else {
            killedPlayer = werewolfTarget;
            // Get the killed player's role
            if (killedPlayer === game.humanPlayerName) {
                killedPlayerRole = game.humanPlayerRole;
            } else {
                const killedBot = game.bots.find(bot => bot.name === killedPlayer);
                killedPlayerRole = killedBot ? killedBot.role : 'unknown';
            }
        }
    } else {
        noWerewolfActivity = true;
    }
    
    // 2. Determine detective investigation outcome
    let detectiveFoundEvil = false;
    let detectiveTargetDied = false;
    let detectiveWasActive = false;
    
    if (nightResults.detective) {
        detectiveWasActive = true;
        const detectiveTarget = nightResults.detective.target;
        
        // Check if detective target died
        detectiveTargetDied = killedPlayer === detectiveTarget;
        
        // Get the investigated player's role to determine if evil was found
        let detectiveTargetRole: string;
        if (detectiveTarget === game.humanPlayerName) {
            detectiveTargetRole = game.humanPlayerRole;
        } else {
            const targetBot = game.bots.find(bot => bot.name === detectiveTarget);
            detectiveTargetRole = targetBot ? targetBot.role : 'unknown';
        }
        detectiveFoundEvil = detectiveTargetRole === GAME_ROLES.WEREWOLF;
    }
    
    // 3. Use Game Master AI to generate the night results story
    const session = await auth();
    if (!session || !session.user?.email) {
        throw new Error('Not authenticated');
    }

    await ensureUserCanAccessGame(gameId, session.user.email, { gameTier: game.createdWithTier });
    const apiKeys = await getApiKeysForUser(session.user.email);
    
    // Create GM system prompt with game context
    const gmSystemPrompt = format(GM_NIGHT_RESULTS_SYSTEM_PROMPT, {
        players_names: [
            ...game.bots.filter(bot => bot.isAlive).map(bot => bot.name),
            game.humanPlayerName
        ].join(", "),
        dead_players_names_with_roles: game.bots
            .filter(bot => !bot.isAlive)
            .map(bot => `${bot.name} (${bot.role})`)
            .join(", "),
        humanPlayerName: game.humanPlayerName,
        currentDay: game.currentDay,
        theme: game.theme || 'Werewolf Village'
    });

    // Create GM command with night events
    const nightResultsCommand = format(GM_COMMAND_GENERATE_NIGHT_RESULTS, {
        killedPlayer: killedPlayer || 'NONE',
        killedPlayerRole: killedPlayerRole || 'NONE',
        wasKillPrevented: wasKillPrevented ? 'TRUE' : 'FALSE',
        noWerewolfActivity: noWerewolfActivity ? 'TRUE' : 'FALSE',
        detectiveFoundEvil: detectiveFoundEvil ? 'TRUE' : 'FALSE',
        detectiveTargetDied: detectiveTargetDied ? 'TRUE' : 'FALSE',
        detectiveWasActive: detectiveWasActive ? 'TRUE' : 'FALSE',
        doctorWasActive: nightResults.doctor ? 'TRUE' : 'FALSE'
    });
    
    // Create Game Master agent with system prompt
    const gmAgent = AgentFactory.createAgent(GAME_MASTER, gmSystemPrompt, game.gameMasterAiType, apiKeys, false);
    
    // Get day discussion messages and night messages for context
    const dayMessages = await getBotMessages(gameId, GAME_MASTER, game.currentDay);
    
    // Create GM command message
    const gmCommandMessage: GameMessage = {
        id: null,
        recipientName: GAME_MASTER,
        authorName: GAME_MASTER,
        msg: nightResultsCommand,
        messageType: MessageType.GM_COMMAND,
        day: game.currentDay,
        timestamp: Date.now()
    };
    
    // Include conversation history for the GM (day + night messages + command)
    const history = convertToAIMessages(GAME_MASTER, [...dayMessages, gmCommandMessage]);
    const [storyResponse, thinking, tokenUsage] = await gmAgent.askWithZodSchema(NightResultsStoryZodSchema, history);
    if (!storyResponse) {
        throw new BotResponseError(
            'Game Master failed to generate night results story',
            'GM did not respond to night results generation request',
            { gmAiType: game.gameMasterAiType, action: 'night_results' },
            true
        );
    }
    const nightResultsMessage = storyResponse.story;
    
    // Update game master's token usage
    if (tokenUsage) {
        await recordGameMasterTokenUsage(gameId, tokenUsage, session.user.email);
    }
    
    // Log thinking for debugging
    if (thinking) {
        console.log(`🎭 Game Master thinking captured (${thinking.length} chars)`);
    }

    // Check for game end conditions after night actions
    // We need to simulate the game state after eliminating the killed player
    let tempBots = [...game.bots];
    if (killedPlayer && !wasKillPrevented) {
        tempBots = tempBots.map(bot => {
            if (bot.name === killedPlayer) {
                return { ...bot, isAlive: false, eliminationDay: game.currentDay };
            }
            return bot;
        });
    }
    const tempGame = { ...game, bots: tempBots };

    const gameEndChecker = new GameEndChecker();
    const endGameCheck = gameEndChecker.check(tempGame);

    // Append end game message to night results if game is ending
    let finalNightResultsMessage = nightResultsMessage;
    if (endGameCheck.isEnded) {
        const endGameMessage = gameEndChecker.getEndGameMessage(tempGame);
        finalNightResultsMessage = nightResultsMessage + endGameMessage;
        console.log(`🎮 GAME END DETECTED: ${endGameCheck.reason}`);
    }

    // Create Game Master message with the AI-generated night results (and end game announcement if applicable)
    const gameMessage: GameMessage = {
        id: null,
        recipientName: RECIPIENT_ALL,
        authorName: GAME_MASTER,
        msg: { story: finalNightResultsMessage, thinking: thinking || "" },
        messageType: MessageType.NIGHT_SUMMARY,
        day: game.currentDay,
        timestamp: Date.now(),
        cost: tokenUsage?.costUSD
    };

    // Save the Game Master message
    await addMessageToChatAndSaveToDb(gameMessage, gameId);

    // 4. Update game state to NIGHT_RESULTS (don't eliminate players yet - that happens when starting next day)
    const gameUpdates: any = {
        gameState: GAME_STATES.NIGHT_RESULTS,
        gameStateProcessQueue: [],
        gameStateParamQueue: []
    };

    // Update game state
    await db.collection('games').doc(gameId).update(gameUpdates);

    console.log('🌅 NIGHT_RESULTS: All night actions completed with results');
    return await getGame(gameId) as Game;
}


/**
 * Handles night phase progression
 * If game is in VOTE_RESULTS state, transitions to NIGHT and sets up night actions
 * If game is in NIGHT state, processes the next night action in the queue
 */
const MAX_AUTO_NIGHT_STEPS = 100;

async function autoProcessNightActions(gameId: string, initialGame?: Game): Promise<Game> {
    let currentGame = initialGame ?? await getGame(gameId);

    if (!currentGame) {
        throw new Error('Game not found');
    }

    let safetyCounter = 0;

    while (currentGame.gameState === GAME_STATES.NIGHT) {
        safetyCounter++;
        if (safetyCounter > MAX_AUTO_NIGHT_STEPS) {
            console.warn('⚠️ AUTO NIGHT PROCESSOR: Reached safety limit, stopping auto-processing', {
                gameId,
                processQueue: currentGame.gameStateProcessQueue,
                paramQueue: currentGame.gameStateParamQueue
            });
            break;
        }

        // If there are no queued roles or params, attempt to progress the queue
        if (currentGame.gameStateProcessQueue.length === 0 || currentGame.gameStateParamQueue.length === 0) {
            currentGame = await processNightQueue(gameId, currentGame);
            continue;
        }

        const currentRole = currentGame.gameStateProcessQueue[0];
        const currentPlayer = currentGame.gameStateParamQueue[0];

        // Stop auto-processing if the human player needs to act
        if (currentPlayer === currentGame.humanPlayerName && currentRole === currentGame.humanPlayerRole) {
            console.log('🌙 AUTO NIGHT PROCESSOR: Waiting for human action', {
                gameId,
                currentRole,
                currentPlayer
            });
            break;
        }

        currentGame = await processNightQueue(gameId, currentGame);
    }

    return currentGame;
}

async function performNightActionImpl(gameId: string): Promise<Game> {
    // Authentication check
    const session = await auth();
    if (!session || !session.user?.email) {
        throw new Error('Not authenticated');
    }

    // Firestore initialization check
    if (!db) {
        throw new Error('Firestore is not initialized');
    }

    // Fetch the current game
    const game = await getGame(gameId);
    if (!game) {
        throw new Error('Game not found');
    }

    await ensureUserCanAccessGame(gameId, session.user.email, { gameTier: game.createdWithTier });

    await ensureUserCanAccessGame(gameId, session.user.email, { gameTier: game.createdWithTier });

    await ensureUserCanAccessGame(gameId, session.user.email, { gameTier: game.createdWithTier });

    // Handle different game states
    if (game.gameState === GAME_STATES.VOTE_RESULTS) {
        // Transition from VOTE_RESULTS to NIGHT and immediately kick off bot processing
        const nightGame = await beginNightImpl(gameId);
        return await autoProcessNightActions(gameId, nightGame);
    } else if (game.gameState === GAME_STATES.NIGHT) {
        // Process all pending bot actions (stopping if human input is required)
        return await autoProcessNightActions(gameId, game);
    } else if (game.gameState === GAME_STATES.NIGHT_RESULTS) {
        // Night has already ended, return current game state
        console.log('🌅 Night actions already completed, returning current game state');
        return game;
    } else {
        throw new BotResponseError(
            'Invalid game state for night action',
            `Game must be in VOTE_RESULTS, NIGHT, or NIGHT_RESULTS state. Current state: ${game.gameState}`,
            { 
                currentState: game.gameState, 
                expectedStates: [GAME_STATES.VOTE_RESULTS, GAME_STATES.NIGHT, GAME_STATES.NIGHT_RESULTS],
                gameId 
            },
            true
        );
    }

    // This should never be reached due to the validation above
    throw new Error('Unexpected code path in performNightAction');
}

/**
 * Begins the night phase by setting up role actions based on configuration
 * Validates the game is in VOTE_RESULTS state and tr ansitions through night preparation
 */
async function beginNightImpl(gameId: string): Promise<Game> {
    // Authentication check
    const session = await auth();
    if (!session || !session.user?.email) {
        throw new Error('Not authenticated');
    }

    // Firestore initialization check
    if (!db) {
        throw new Error('Firestore is not initialized');
    }

    // Fetch the current game
    const game = await getGame(gameId);
    if (!game) {
        throw new Error('Game not found');
    }

    await ensureUserCanAccessGame(gameId, session.user.email, { gameTier: game.createdWithTier });

    // Validate game state
    if (game.gameState !== GAME_STATES.VOTE_RESULTS) {
        throw new BotResponseError(
            'Invalid game state for beginning night',
            `Game must be in VOTE_RESULTS state to begin night. Current state: ${game.gameState}`,
            { 
                currentState: game.gameState, 
                expectedState: GAME_STATES.VOTE_RESULTS,
                gameId 
            },
            true
        );
    }

    try {
        // Get unique roles with night actions that have alive players, sorted by action order
        const activeNightRoles = new Set<string>();
        
        // Check all bots for night actions
        game.bots
            .filter(bot => bot.isAlive && ROLE_CONFIGS[bot.role])
            .forEach(bot => {
                activeNightRoles.add(bot.role);
            });

        // Check human player for night actions
        if (ROLE_CONFIGS[game.humanPlayerRole]) {
            activeNightRoles.add(game.humanPlayerRole);
        }

        // Convert to sorted array based on nightActionOrder
        const sortedNightRoles = Array.from(activeNightRoles)
            .sort((a, b) => ROLE_CONFIGS[a].nightActionOrder - ROLE_CONFIGS[b].nightActionOrder);

        // Create Game Master message explaining the night phase
        const roleDescriptions = Object.values(ROLE_CONFIGS)
            .filter(config => config)
            .sort((a, b) => a.nightActionOrder - b.nightActionOrder)
            .map(config => `• ${config.name}: ${config.description}`)
            .join('\n');

        const gmMessage = `Night falls over the village. During this phase, players with special abilities will act in this order:\n${roleDescriptions}\n\nThe night actions will be processed automatically.`;

        const gameMessage: GameMessage = {
            id: null,
            recipientName: RECIPIENT_ALL,
            authorName: GAME_MASTER,
            msg: gmMessage,
            messageType: MessageType.NIGHT_BEGINS,
            day: game.currentDay,
            timestamp: Date.now()
        };

        // Save the Game Master message
        await addMessageToChatAndSaveToDb(gameMessage, gameId);

        // Initialize gameStateParamQueue with players for the first role using processor's init method
        let initialParamQueue: string[] = [];
        if (sortedNightRoles.length > 0) {
            const firstRole = sortedNightRoles[0];
            const firstRoleProcessor = RoleProcessorFactory.createProcessor(firstRole, gameId, game);
            
            if (firstRoleProcessor) {
                const initResult = await firstRoleProcessor.init();
                if (initResult.success) {
                    initialParamQueue = initResult.paramQueue;
                } else {
                    throw new BotResponseError(
                        `Failed to initialize ${firstRole} processor`,
                        initResult.error || 'Unknown initialization error',
                        { role: firstRole, gameId },
                        true
                    );
                }
            }
        }

        // Update game state with night action queue
        await db.collection('games').doc(gameId).update({
            gameState: GAME_STATES.NIGHT,
            gameStateProcessQueue: sortedNightRoles,
            gameStateParamQueue: initialParamQueue
        });

        console.log(`🌙 NIGHT: Set up night actions for ${sortedNightRoles.length} roles: ${sortedNightRoles.join(', ')}`);

        // Return the updated game state
        return await getGame(gameId) as Game;
    } catch (error) {
        console.error('Error in beginNight function:', error);
        
        // Re-throw BotResponseError as-is for frontend handling
        if (error instanceof BotResponseError) {
            throw error;
        }
        
        // Wrap other errors in BotResponseError for consistent handling
        throw new BotResponseError(
            'System error occurred during night setup',
            error instanceof Error ? error.message : 'Unknown error',
            { originalError: error },
            false // System errors are typically not recoverable
        );
    }
}

/**
 * Replays the night phase by resetting the game back to VOTE_RESULTS state
 * This clears all night actions and allows the night to be started again
 */
async function replayNightImpl(gameId: string): Promise<Game> {
    // Authentication check
    const session = await auth();
    if (!session || !session.user?.email) {
        throw new Error('Not authenticated');
    }

    // Firestore initialization check
    if (!db) {
        throw new Error('Firestore is not initialized');
    }

    // Fetch the current game
    const game = await getGame(gameId);
    if (!game) {
        throw new Error('Game not found');
    }

    // Validate game state (should be in a night phase)
    if (game.gameState !== GAME_STATES.NIGHT && game.gameState !== GAME_STATES.NIGHT_RESULTS) {
        throw new BotResponseError(
            'Invalid game state for replaying night',
            `Game must be in NIGHT or NIGHT_RESULTS state to replay night. Current state: ${game.gameState}`,
            { 
                currentState: game.gameState, 
                expectedStates: [GAME_STATES.NIGHT, GAME_STATES.NIGHT_RESULTS],
                gameId 
            },
            true
        );
    }

    try {
        // Find the FIRST (earliest) NIGHT_BEGINS message for the current day
        // This ensures we delete ALL night-related messages, even from previous replay attempts
        const nightBeginsSnapshot = await db.collection('games')
            .doc(gameId)
            .collection('messages')
            .where('messageType', '==', MessageType.NIGHT_BEGINS)
            .where('day', '==', game.currentDay)
            .orderBy('timestamp', 'asc')  // Get the EARLIEST/FIRST one
            .limit(1)
            .get();

        if (nightBeginsSnapshot.empty) {
            console.log(`⚠️ REPLAY NIGHT: No NIGHT_BEGINS message found for day ${game.currentDay}, cannot delete messages`);
        } else {
            const nightBeginsDoc = nightBeginsSnapshot.docs[0];
            const nightBeginsTimestamp = nightBeginsDoc.data().timestamp;
            
            console.log(`🔍 REPLAY NIGHT: Found FIRST NIGHT_BEGINS message for day ${game.currentDay} at timestamp ${nightBeginsTimestamp}`);

            // Use Firestore query to find all messages FROM the NIGHT_BEGINS message onward (including the night message itself)
            const messagesToDeleteSnapshot = await db.collection('games')
                .doc(gameId)
                .collection('messages')
                .where('timestamp', '>=', nightBeginsTimestamp)
                .get();

            if (messagesToDeleteSnapshot.empty) {
                console.log(`ℹ️ REPLAY NIGHT: No messages found from night start onward`);
            } else {
                // Delete messages individually
                const deletePromises = messagesToDeleteSnapshot.docs.map(doc => doc.ref.delete());
                await Promise.all(deletePromises);
                console.log(`🔄 REPLAY NIGHT: Successfully deleted ${messagesToDeleteSnapshot.size} night messages from database`);
            }
        }

        // Reset game state back to VOTE_RESULTS and clear night results
        await db.collection('games').doc(gameId).update({
            gameState: GAME_STATES.VOTE_RESULTS,
            gameStateProcessQueue: [],
            gameStateParamQueue: [],
            nightResults: {}
        });

        console.log('🔄 REPLAY NIGHT: Game state reset to VOTE_RESULTS');

        // Return the updated game state
        return await getGame(gameId) as Game;
    } catch (error) {
        console.error('Error in replayNight function:', error);
        
        // Re-throw BotResponseError as-is for frontend handling
        if (error instanceof BotResponseError) {
            throw error;
        }
        
        // Wrap other errors in BotResponseError for consistent handling
        throw new BotResponseError(
            'System error occurred during night replay',
            error instanceof Error ? error.message : 'Unknown error',
            { originalError: error },
            false // System errors are typically not recoverable
        );
    }
}


/**
 * Process the next item in the night action queue
 * NEW LOGIC: Only processes if current player is a bot. Human players are handled by frontend UI.
 */
async function processNightQueue(gameId: string, game: Game): Promise<Game> {
    // Firestore initialization check
    if (!db) {
        throw new Error('Firestore is not initialized');
    }
    
    try {
        // If process queue is empty, end the night with results
        if (game.gameStateProcessQueue.length === 0) {
            return await endNightWithResults(gameId, game);
        }

        // If param queue is empty, handle role transition first
        if (game.gameStateParamQueue.length === 0) {
            // Current role finished, move to next role or end night
            const newProcessQueue = game.gameStateProcessQueue.slice(1);
            
            if (newProcessQueue.length === 0) {
                // No more roles, end the night with results
                return await endNightWithResults(gameId, game);
            } else {
                // Move to next role using processor's init method
                const nextRole = newProcessQueue[0];
                const nextRoleProcessor = RoleProcessorFactory.createProcessor(nextRole, gameId, game);
                
                if (!nextRoleProcessor) {
                    throw new BotResponseError(
                        `No processor for role: ${nextRole}`,
                        `Could not create processor for role ${nextRole}`,
                        { role: nextRole, gameId },
                        true
                    );
                }
                
                const initResult = await nextRoleProcessor.init();
                if (!initResult.success) {
                    throw new BotResponseError(
                        `Failed to initialize ${nextRole} processor`,
                        initResult.error || 'Unknown initialization error',
                        { role: nextRole, gameId },
                        true
                    );
                }
                
                await db.collection('games').doc(gameId).update({
                    gameStateProcessQueue: newProcessQueue,
                    gameStateParamQueue: initResult.paramQueue
                });
                
                console.log(`🌙 MOVED TO NEXT ROLE: ${nextRole} with players [${initResult.paramQueue.join(', ')}]`);
                
                // Return the updated game state and continue processing
                return await getGame(gameId) as Game;
            }
        }

        const currentRole = game.gameStateProcessQueue[0];
        const currentPlayer = game.gameStateParamQueue[0];
        
        console.log(`🌙 PROCESS NIGHT QUEUE: Role=${currentRole}, Player=${currentPlayer}, ParamQueue=[${game.gameStateParamQueue.join(', ')}]`);

        // NEW LOGIC: Check if current player is human - if so, skip processing and let frontend handle
        if (currentPlayer === game.humanPlayerName) {
            console.log(`🌙 SKIPPING NIGHT PROCESSING: Human player ${currentPlayer} needs to act via UI`);
            return game; // Return current game state without changes
        }

        // Current player is a bot - process the action
        const currentBot = game.bots.find(bot => bot.name === currentPlayer && bot.isAlive);
        if (!currentBot) {
            throw new BotResponseError(
                `Bot not found: ${currentPlayer}`,
                `Expected to find alive bot named ${currentPlayer} for role ${currentRole}`,
                { currentPlayer, currentRole, gameId },
                true
            );
        }

        // Create role processor for the current role
        const roleProcessor = RoleProcessorFactory.createProcessor(currentRole, gameId, game);
        
        if (!roleProcessor) {
            throw new BotResponseError(
                `No processor for role: ${currentRole}`,
                `Could not create processor for role ${currentRole}`,
                { currentRole, gameId },
                true
            );
        }

        // Process the night action for this role
        const result = await roleProcessor.processNightAction();
        
        if (!result.success) {
            console.error(`🌙 NIGHT ACTION ERROR: Failed to process ${currentRole} action: ${result.error}`);
            throw new BotResponseError(
                `Night action failed for ${currentRole}`,
                result.error || 'Unknown error in role processor',
                {
                    role: currentRole,
                    player: currentPlayer,
                    gameId,
                    gameState: game.gameState,
                    gameStateProcessQueue: game.gameStateProcessQueue,
                    gameStateParamQueue: game.gameStateParamQueue
                },
                true // Recoverable - user can replay night phase
            );
        }

        // Apply game updates from the role processor
        if (result.gameUpdates && Object.keys(result.gameUpdates).length > 0) {
            await db.collection('games').doc(gameId).update(result.gameUpdates);
        }

        // Check if we need to move to next role (param queue empty) or end night (no more roles)
        const updatedGame = await getGame(gameId) as Game;
        
        if (updatedGame.gameStateParamQueue.length === 0) {
            // Current role finished, move to next role or end night
            const newProcessQueue = updatedGame.gameStateProcessQueue.slice(1);
            
            if (newProcessQueue.length === 0) {
                // No more roles, end the night with results
                return await endNightWithResults(gameId, updatedGame);
            } else {
                // Move to next role using processor's init method
                const nextRole = newProcessQueue[0];
                const nextRoleProcessor = RoleProcessorFactory.createProcessor(nextRole, gameId, updatedGame);
                
                if (!nextRoleProcessor) {
                    throw new BotResponseError(
                        `No processor for role: ${nextRole}`,
                        `Could not create processor for role ${nextRole}`,
                        { role: nextRole, gameId },
                        true
                    );
                }
                
                const initResult = await nextRoleProcessor.init();
                if (!initResult.success) {
                    throw new BotResponseError(
                        `Failed to initialize ${nextRole} processor`,
                        initResult.error || 'Unknown initialization error',
                        { role: nextRole, gameId },
                        true
                    );
                }
                
                await db.collection('games').doc(gameId).update({
                    gameStateProcessQueue: newProcessQueue,
                    gameStateParamQueue: initResult.paramQueue
                });
                
                console.log(`🌙 MOVED TO NEXT ROLE: ${nextRole} with players [${initResult.paramQueue.join(', ')}]`);
            }
        }

        // Return the updated game state
        return await getGame(gameId) as Game;
    } catch (error) {
        console.error('Error in processNightQueue function:', error);
        
        // Re-throw BotResponseError as-is for frontend handling
        if (error instanceof BotResponseError) {
            throw error;
        }
        
        // Wrap other errors in BotResponseError for consistent handling
        throw new BotResponseError(
            'System error occurred during night queue processing',
            error instanceof Error ? error.message : 'Unknown error',
            { originalError: error },
            false // System errors are typically not recoverable
        );
    }
}

/**
 * Handles human player talking during werewolves coordination phase
 * This function is called when the human werewolf is not the last in the param queue
 * and needs to participate in discussion without making the final target decision
 */
async function humanPlayerTalkWerewolvesImpl(gameId: string, message: string): Promise<Game> {
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

    // Check if it's werewolf phase and human player's turn
    if (game.gameStateProcessQueue.length === 0 || game.gameStateParamQueue.length === 0) {
        throw new Error('No night actions in progress');
    }

    const currentRole = game.gameStateProcessQueue[0];
    const currentPlayer = game.gameStateParamQueue[0];

    if (currentRole !== GAME_ROLES.WEREWOLF) {
        throw new Error('Not currently werewolf phase');
    }

    if (game.humanPlayerRole !== GAME_ROLES.WEREWOLF || currentPlayer !== game.humanPlayerName) {
        throw new Error('Not your turn for werewolf discussion');
    }

    // Ensure this is NOT the last player in queue (coordination phase only)
    if (game.gameStateParamQueue.length === 1) {
        throw new Error('Use performHumanPlayerNightAction for final werewolf action');
    }

    try {
        // Create werewolf coordination message
        const werewolfMessage: GameMessage = {
            id: null,
            recipientName: RECIPIENT_WEREWOLVES,
            authorName: game.humanPlayerName,
            msg: { reply: message },
            messageType: MessageType.BOT_ANSWER,
            day: game.currentDay,
            timestamp: Date.now()
        };
        
        // Save message to database
        await addMessageToChatAndSaveToDb(werewolfMessage, gameId);
        
        // Remove the human player from param queue
        const newParamQueue = game.gameStateParamQueue.slice(1);
        
        // If param queue becomes empty after removing this player, populate it for the next role
        let finalUpdates: any = {
            gameStateParamQueue: newParamQueue
        };

        if (newParamQueue.length === 0) {
            // Remove current role from process queue and move to next role
            const newProcessQueue = game.gameStateProcessQueue.slice(1);
            finalUpdates.gameStateProcessQueue = newProcessQueue;

            // If there are more roles, initialize param queue for the next role
            if (newProcessQueue.length > 0) {
                const nextRole = newProcessQueue[0];
                const nextRoleProcessor = RoleProcessorFactory.createProcessor(nextRole, gameId, game);
                
                if (nextRoleProcessor) {
                    const initResult = await nextRoleProcessor.init();
                    if (initResult.success) {
                        finalUpdates.gameStateParamQueue = initResult.paramQueue;
                    } else {
                        // Log error but don't throw - let the main night processing handle it
                        console.error(`Failed to initialize ${nextRole} processor:`, initResult.error);
                        finalUpdates.gameStateParamQueue = [];
                    }
                } else {
                    finalUpdates.gameStateParamQueue = [];
                }
            }
        }
        
        // Update game state
        await db.collection('games').doc(gameId).update(finalUpdates);
        
        console.log(`Human player ${game.humanPlayerName} participated in werewolf discussion`);
        
        // Return updated game state
        return await getGame(gameId) as Game;
    } catch (error) {
        console.error('Error in humanPlayerTalkWerewolves function:', error);
        throw error;
    }
}

/**
 * Start new day by applying night results and transitioning to NEW_DAY_BOT_SUMMARIES state
 * Merges the functionality of newDayBegins + endNight
 */
async function startNewDayImpl(gameId: string): Promise<Game> {
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
        const currentGame = { id: gameId, ...gameData } as Game;

        await ensureUserCanAccessGame(gameId, session.user.email, { gameTier: currentGame.createdWithTier });
        
        // Validate that we're in NIGHT_RESULTS state
        if (gameData?.gameState !== GAME_STATES.NIGHT_RESULTS) {
            throw new Error(`Cannot start new day from state: ${gameData?.gameState}. Expected: ${GAME_STATES.NIGHT_RESULTS}`);
        }
        
        console.log(`🌅 Starting new day by applying night results and transitioning to NEW_DAY_BOT_SUMMARIES`);

        // Apply night results - eliminate werewolf targets if successful
        let updatedBots = [...currentGame.bots];
        const nightResults = currentGame.nightResults || {};
        
        // Store night results for future reference before clearing
        const previousNightResults = { ...nightResults };
        
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
        
        // Check for game end conditions after applying night results
        const tempGame = { ...currentGame, bots: updatedBots };
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
                day: currentGame.currentDay,
                timestamp: Date.now(),
            };
            await addMessageToChatAndSaveToDb(gameEndMessage, gameId);
            
            // Update game state to GAME_OVER
            await gameRef.update({
                gameState: GAME_STATES.GAME_OVER,
                gameStateParamQueue: [],
                gameStateProcessQueue: [],
                bots: updatedBots,
                previousNightResults: previousNightResults,
                nightResults: {}
            });
            
            return await getGame(gameId) as Game;
        }
        
        // Transition to NEW_DAY_BOT_SUMMARIES state and populate processing queue
        // Move nightResults to previousNightResults and clear nightResults for next night
        await gameRef.update({
            gameState: GAME_STATES.NEW_DAY_BOT_SUMMARIES,
            gameStateParamQueue: [],
            gameStateProcessQueue: aliveBotNames,
            bots: updatedBots,
            previousNightResults: previousNightResults,
            nightResults: {} // Clear night results for the next night phase
        });
        
        console.log(`💭 Transitioned to NEW_DAY_BOT_SUMMARIES with ${aliveBotNames.length} bots to summarize`);
        
        // Return the updated game
        return await getGame(gameId) as Game;
    } catch (error: any) {
        console.error("Error starting new day: ", error);
        throw new Error(`Failed to start new day: ${error.message}`);
    }
}

/**
 * Summarize past day for one bot (called sequentially from UI)
 */
async function summarizePastDayImpl(gameId: string): Promise<Game> {
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
        
        // Validate that we're in NEW_DAY_BOT_SUMMARIES state
        if (gameData?.gameState !== GAME_STATES.NEW_DAY_BOT_SUMMARIES) {
            throw new Error(`Cannot summarize day from state: ${gameData?.gameState}. Expected: ${GAME_STATES.NEW_DAY_BOT_SUMMARIES}`);
        }
        
        // Get the first bot from the processing queue
        const processQueue = [...(gameData.gameStateProcessQueue || [])];
        if (processQueue.length === 0) {
            // No more bots to process, transition to DAY_DISCUSSION and increment day
            const nextDay = (currentGame.currentDay || 1) + 1;
            
            // Create Game Master message for new day
            const gmStory = `☀️ **Day ${nextDay} begins.**\n\nThe village awakens to a new day. The events of the night have left their mark. Now is the time to discuss what happened and decide who among you might be a threat to the village.\n\nDiscuss the night's events, share your suspicions, and prepare to vote when ready.`;
            
            const gameMessage: GameMessage = {
                id: null,
                recipientName: RECIPIENT_ALL,
                authorName: GAME_MASTER,
                msg: { story: gmStory },
                messageType: MessageType.GAME_STORY,
                day: nextDay,
                timestamp: Date.now()
            };
            
            // Save the Game Master message
            await addMessageToChatAndSaveToDb(gameMessage, gameId);
            
            await gameRef.update({
                gameState: GAME_STATES.DAY_DISCUSSION,
                gameStateProcessQueue: [],
                gameStateParamQueue: [],
                currentDay: nextDay,
                dayActivityCounter: {} // Reset activity counter for new day
            });
            console.log(`💭 All bot summaries completed, starting Day ${nextDay}`);
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
        await ensureUserCanAccessGame(gameId, session.user.email, { gameTier: currentGame.createdWithTier });
        
        // Get API keys
        const apiKeys = await getApiKeysForUser(session.user.email);
        
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
        const [summaryResponse, thinking, tokenUsage] = await agent.askWithZodSchema(BotAnswerZodSchema, history);
        
        // Update bot's token usage
        if (tokenUsage) {
            await recordBotTokenUsage(gameId, bot.name, tokenUsage, session.user.email);
        }
        
        if (!summaryResponse) {
            console.warn(`💭 Bot ${bot.name} failed to generate summary for day ${currentGame.currentDay}`);
            await gameRef.update({
                gameStateProcessQueue: processQueue
            });
            return await getGame(gameId) as Game;
        }
        
        let summary: string = ""; // Initialize with empty string
        try {
            summary = summaryResponse.reply || ""; // Ensure not undefined
        } catch (parseError: any) {
            console.error(`💭 Failed to parse summary JSON for bot ${bot.name}:`, parseError);
            console.error('💭 Raw response:', summaryResponse);
            
            // Try to extract summary from the response as fallback
            try {
                // The response is now a typed object from Zod schema
                if (summaryResponse && summaryResponse.reply) {
                    summary = summaryResponse.reply;
                    console.log(`💭 Using reply property as summary for bot ${bot.name}: ${summary.substring(0, 100)}...`);
                    
                    if (summary.length > 10) { // Basic validation
                        console.log(`💭 Using cleaned response as summary for bot ${bot.name}: ${summary.substring(0, 100)}...`);
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
                throw new Error(`Bot ${bot.name} response parsing failed: ${parseError.message}. Response: ${JSON.stringify(summaryResponse)?.substring(0, 200)}...`);
            }
        }
        
        // Ensure summary is never undefined or null
        if (!summary || summary === "undefined" || summary === "null") {
            summary = `Summary for day ${currentGame.currentDay}`;
        }
        
        // Update the bot with the new summary
        const updatedBots = currentGame.bots.map(b => {
            if (b.name === botName) {
                // Initialize daySummaries array if needed
                const daySummaries = [...(b.daySummaries || [])]; // Create a copy
                
                // Ensure array is large enough for this day index (day 1 -> index 0)
                while (daySummaries.length < currentGame.currentDay) {
                    daySummaries.push(""); // Push empty string, never undefined
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

function gameFromFirestore(id: string, data: any): Game {
    return {
        id,
        description: data.description,
        theme: data.theme,
        werewolfCount: data.werewolfCount,
        specialRoles: data.specialRoles,
        gameMasterAiType: data.gameMasterAiType,
        gameMasterVoice: data.gameMasterVoice,
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
        messageCounter: data.messageCounter || 0,
        dayActivityCounter: data.dayActivityCounter || {},
        createdWithTier: data.createdWithTier || 'free'
    };
}

// Wrapped exports with error handling
export const performNightAction = withGameErrorHandling(performNightActionImpl);
export const beginNight = withGameErrorHandling(beginNightImpl);
export const replayNight = withGameErrorHandling(replayNightImpl);
export const humanPlayerTalkWerewolves = withGameErrorHandling(humanPlayerTalkWerewolvesImpl);
export const startNewDay = withGameErrorHandling(startNewDayImpl);
export const summarizePastDay = withGameErrorHandling(summarizePastDayImpl);
