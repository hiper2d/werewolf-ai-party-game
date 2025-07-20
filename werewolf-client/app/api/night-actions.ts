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
import { generateNightResultsMessage } from "@/app/utils/message-utils";

/**
 * Helper function to handle night end logic with results processing
 * @param gameId - The game ID
 * @param game - The current game state
 */
async function endNightWithResults(gameId: string, game: Game): Promise<Game> {
    if (!db) {
        throw new Error('Firestore is not initialized');
    }

    // Generate night results message
    const nightResultsMessage = generateNightResultsMessage(game.nightResults || {}, game);
    
    // Create Game Master message with night results
    const gameMessage: GameMessage = {
        id: null,
        recipientName: RECIPIENT_ALL,
        authorName: GAME_MASTER,
        msg: { story: nightResultsMessage },
        messageType: MessageType.GAME_STORY,
        day: game.currentDay,
        timestamp: Date.now()
    };

    // Save the Game Master message
    await addMessageToChatAndSaveToDb(gameMessage, gameId);

    // Handle player elimination if werewolf killed someone and doctor didn't protect them
    let gameUpdates: any = {
        gameState: GAME_STATES.NIGHT_ENDS,
        gameStateProcessQueue: [],
        gameStateParamQueue: []
    };

    if (game.nightResults?.werewolf) {
        const target = game.nightResults.werewolf.target;
        const wasProtected = game.nightResults.doctor && game.nightResults.doctor.target === target;
        
        if (!wasProtected) {
            // Player was killed - eliminate them
            if (target === game.humanPlayerName) {
                // Human player was killed - game over
                gameUpdates.gameState = GAME_STATES.GAME_OVER;
            } else {
                // Bot was killed - set isAlive = false
                const updatedBots = game.bots.map(bot =>
                    bot.name === target
                        ? { ...bot, isAlive: false, eliminationDay: game.currentDay }
                        : bot
                );
                gameUpdates.bots = updatedBots;
            }
        }
    }

    // Update game state
    await db.collection('games').doc(gameId).update(gameUpdates);

    console.log('🌅 NIGHT_ENDS: All night actions completed with results');
    return await getGame(gameId) as Game;
}

/**
 * Helper function to populate gameStateParamQueue with players for a given role
 * @param game - The current game state
 * @param role - The role to get players for
 * @returns Array of player names for the param queue
 */
function populateParamQueueForRole(game: Game, role: string): string[] {
    // Get players with this role
    const playersWithRole: string[] = [];
    
    // Check bots
    game.bots
        .filter(bot => bot.isAlive && bot.role === role)
        .forEach(bot => playersWithRole.push(bot.name));
    
    // Check human player
    if (game.humanPlayerRole === role) {
        playersWithRole.push(game.humanPlayerName);
    }
    playersWithRole.sort(() => Math.random() - 0.5)
    
    // For werewolves, duplicate the list if multiple werewolves exist (for coordination phase)
    let paramQueue: string[] = [];
    if (role === GAME_ROLES.WEREWOLF && playersWithRole.length > 1) {
        paramQueue = [...playersWithRole, ...playersWithRole];
    } else {
        paramQueue = [...playersWithRole];
    }
    
    // Randomize the order
    return playersWithRole;
}

/**
 * Handles night phase progression
 * If game is in VOTE_RESULTS state, transitions to NIGHT and sets up night actions
 * If game is in NIGHT state, processes the next night action in the queue
 */
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

    // Handle different game states
    if (game.gameState === GAME_STATES.VOTE_RESULTS) {
        // Transition from VOTE_RESULTS to NIGHT and set up night actions
        return await beginNightImpl(gameId);
    } else if (game.gameState === GAME_STATES.NIGHT) {
        // Process next night action or end night if queue is empty
        return await processNightQueue(gameId, game);
    } else if (game.gameState === GAME_STATES.NIGHT_ENDS) {
        // Night has already ended, return current game state
        console.log('🌅 Night actions already completed, returning current game state');
        return game;
    } else {
        throw new BotResponseError(
            'Invalid game state for night action',
            `Game must be in VOTE_RESULTS, NIGHT, or NIGHT_ENDS state. Current state: ${game.gameState}`,
            { 
                currentState: game.gameState, 
                expectedStates: [GAME_STATES.VOTE_RESULTS, GAME_STATES.NIGHT, GAME_STATES.NIGHT_ENDS],
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

        // Initialize gameStateParamQueue with players for the first role
        let initialParamQueue: string[] = [];
        if (sortedNightRoles.length > 0) {
            const firstRole = sortedNightRoles[0];
            initialParamQueue = populateParamQueueForRole(game, firstRole);
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
    if (game.gameState !== GAME_STATES.NIGHT && game.gameState !== GAME_STATES.NIGHT_ENDS) {
        throw new BotResponseError(
            'Invalid game state for replaying night',
            `Game must be in NIGHT or NIGHT_ENDS state to replay night. Current state: ${game.gameState}`,
            { 
                currentState: game.gameState, 
                expectedStates: [GAME_STATES.NIGHT, GAME_STATES.NIGHT_ENDS],
                gameId 
            },
            true
        );
    }

    try {
        // Find the NIGHT_BEGINS message for the current day using the specific message type
        const nightBeginsSnapshot = await db.collection('games')
            .doc(gameId)
            .collection('messages')
            .where('messageType', '==', MessageType.NIGHT_BEGINS)
            .where('day', '==', game.currentDay)
            .orderBy('timestamp', 'desc')
            .limit(1)
            .get();

        if (nightBeginsSnapshot.empty) {
            console.log(`⚠️ REPLAY NIGHT: No NIGHT_BEGINS message found for day ${game.currentDay}, cannot delete messages`);
        } else {
            const nightBeginsDoc = nightBeginsSnapshot.docs[0];
            const nightBeginsTimestamp = nightBeginsDoc.data().timestamp;
            
            console.log(`🔍 REPLAY NIGHT: Found NIGHT_BEGINS message for day ${game.currentDay} at timestamp ${nightBeginsTimestamp}`);

            // Use Firestore query to find all messages FROM the NIGHT_BEGINS message onward (including the night message itself)
            const messagesToDeleteSnapshot = await db.collection('games')
                .doc(gameId)
                .collection('messages')
                .where('timestamp', '>=', nightBeginsTimestamp)
                .get();

            if (messagesToDeleteSnapshot.empty) {
                console.log(`ℹ️ REPLAY NIGHT: No messages found from night start onward`);
            } else {
                // Create batch operation to delete messages
                const batch = db.batch();
                
                messagesToDeleteSnapshot.docs.forEach(doc => {
                    batch.delete(doc.ref);
                });

                await batch.commit();
                console.log(`🔄 REPLAY NIGHT: Successfully deleted ${messagesToDeleteSnapshot.size} night messages from database`);
            }
        }

        // Reset game state back to VOTE_RESULTS
        await db.collection('games').doc(gameId).update({
            gameState: GAME_STATES.VOTE_RESULTS,
            gameStateProcessQueue: [],
            gameStateParamQueue: []
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

        // Param queue should always be populated when there are active roles
        // If it's empty, this indicates a logic error in role transition
        if (game.gameStateParamQueue.length === 0) {
            console.error('🚨 CRITICAL ERROR: Empty param queue with active process queue', {
                gameId,
                currentRole: game.gameStateProcessQueue[0],
                processQueue: game.gameStateProcessQueue,
                paramQueue: game.gameStateParamQueue
            });
            throw new BotResponseError(
                'Invalid game state: empty parameter queue',
                'The gameStateParamQueue should be populated when there are active roles in gameStateProcessQueue',
                {
                    gameId,
                    currentRole: game.gameStateProcessQueue[0],
                    processQueue: game.gameStateProcessQueue,
                    paramQueue: game.gameStateParamQueue
                },
                true
            );
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
                // Move to next role
                const nextRole = newProcessQueue[0];
                const nextRoleParamQueue = populateParamQueueForRole(updatedGame, nextRole);
                
                await db.collection('games').doc(gameId).update({
                    gameStateProcessQueue: newProcessQueue,
                    gameStateParamQueue: nextRoleParamQueue
                });
                
                console.log(`🌙 MOVED TO NEXT ROLE: ${nextRole} with players [${nextRoleParamQueue.join(', ')}]`);
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

            // If there are more roles, populate param queue for the next role
            if (newProcessQueue.length > 0) {
                const nextRole = newProcessQueue[0];
                finalUpdates.gameStateParamQueue = populateParamQueueForRole(game, nextRole);
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

// Wrapped exports with error handling
export const performNightAction = withGameErrorHandling(performNightActionImpl);
export const beginNight = withGameErrorHandling(beginNightImpl);
export const replayNight = withGameErrorHandling(replayNightImpl);
export const humanPlayerTalkWerewolves = withGameErrorHandling(humanPlayerTalkWerewolvesImpl);