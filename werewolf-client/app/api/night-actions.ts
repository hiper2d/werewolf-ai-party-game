'use server';

import {db} from "@/firebase/server";
import {
    Game,
    GAME_STATES,
    BotResponseError,
    ROLE_CONFIGS,
    GAME_MASTER,
    GameMessage,
    MessageType,
    RECIPIENT_ALL
} from "@/app/api/game-models";
import {auth} from "@/auth";
import {getGame, addMessageToChatAndSaveToDb} from "./game-actions";
import { RoleProcessorFactory } from "./roles";
import {withGameErrorHandling} from "@/app/utils/server-action-wrapper";

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
        return await initializeNight(gameId, game);
    } else if (game.gameState === GAME_STATES.NIGHT) {
        // Process next night action or end night if queue is empty
        return await processNightQueue(gameId, game);
    } else {
        throw new BotResponseError(
            'Invalid game state for night action',
            `Game must be in VOTE_RESULTS or NIGHT state. Current state: ${game.gameState}`,
            { 
                currentState: game.gameState, 
                expectedStates: [GAME_STATES.VOTE_RESULTS, GAME_STATES.NIGHT],
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
 * Validates the game is in VOTE_RESULTS state and transitions through night preparation
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
            .filter(bot => bot.isAlive && ROLE_CONFIGS[bot.role]?.hasNightAction)
            .forEach(bot => {
                activeNightRoles.add(bot.role);
            });

        // Check human player for night actions
        if (ROLE_CONFIGS[game.humanPlayerRole]?.hasNightAction) {
            activeNightRoles.add(game.humanPlayerRole);
        }

        // Convert to sorted array based on nightActionOrder
        const sortedNightRoles = Array.from(activeNightRoles)
            .sort((a, b) => ROLE_CONFIGS[a].nightActionOrder - ROLE_CONFIGS[b].nightActionOrder);

        // Create Game Master message explaining the night phase
        const roleDescriptions = Object.values(ROLE_CONFIGS)
            .filter(config => config.hasNightAction)
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

        // Update game state with night action queue
        await db.collection('games').doc(gameId).update({
            gameState: GAME_STATES.NIGHT,
            gameStateProcessQueue: sortedNightRoles,
            gameStateParamQueue: []
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
 * Initialize night phase from VOTE_RESULTS state
 */
async function initializeNight(gameId: string, game: Game): Promise<Game> {
    // Firestore initialization check
    if (!db) {
        throw new Error('Firestore is not initialized');
    }
    
    try {
        // Get unique roles with night actions that have alive players, sorted by action order
        const activeNightRoles = new Set<string>();
        
        // Check all bots for night actions
        game.bots
            .filter(bot => bot.isAlive && ROLE_CONFIGS[bot.role]?.hasNightAction)
            .forEach(bot => {
                activeNightRoles.add(bot.role);
            });

        // Check human player for night actions
        if (ROLE_CONFIGS[game.humanPlayerRole]?.hasNightAction) {
            activeNightRoles.add(game.humanPlayerRole);
        }

        // Convert to sorted array based on nightActionOrder
        const sortedNightRoles = Array.from(activeNightRoles)
            .sort((a, b) => ROLE_CONFIGS[a].nightActionOrder - ROLE_CONFIGS[b].nightActionOrder);

        // Create Game Master message explaining the night phase
        const roleDescriptions = Object.values(ROLE_CONFIGS)
            .filter(config => config.hasNightAction)
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

        // Update game state with night action queue
        await db.collection('games').doc(gameId).update({
            gameState: GAME_STATES.NIGHT,
            gameStateProcessQueue: sortedNightRoles,
            gameStateParamQueue: []
        });

        console.log(`🌙 NIGHT: Set up night actions for ${sortedNightRoles.length} roles: ${sortedNightRoles.join(', ')}`);

        // Return the updated game state
        return await getGame(gameId) as Game;
    } catch (error) {
        console.error('Error in initializeNight function:', error);
        
        // Re-throw BotResponseError as-is for frontend handling
        if (error instanceof BotResponseError) {
            throw error;
        }
        
        // Wrap other errors in BotResponseError for consistent handling
        throw new BotResponseError(
            'System error occurred during night initialization',
            error instanceof Error ? error.message : 'Unknown error',
            { originalError: error },
            false // System errors are typically not recoverable
        );
    }
}

/**
 * Process the next item in the night action queue
 */
async function processNightQueue(gameId: string, game: Game): Promise<Game> {
    // Firestore initialization check
    if (!db) {
        throw new Error('Firestore is not initialized');
    }
    
    try {
        // If queue is empty, end the night
        if (game.gameStateProcessQueue.length === 0) {
            await db.collection('games').doc(gameId).update({
                gameState: GAME_STATES.NIGHT_ENDS,
                gameStateProcessQueue: [],
                gameStateParamQueue: []
            });

            console.log('🌅 NIGHT_ENDS: All night actions completed');
            return await getGame(gameId) as Game;
        }

        // Get the next role to act
        const currentRole = game.gameStateProcessQueue[0];
        const remainingQueue = game.gameStateProcessQueue.slice(1);

        // Create role processor for the current role
        const roleProcessor = RoleProcessorFactory.createProcessor(currentRole, gameId, game);
        
        if (!roleProcessor) {
            // This role doesn't have night actions, skip it
            console.warn(`🌙 NIGHT ACTION: Role ${currentRole} has no processor, skipping`);
        } else {
            // Process the night action for this role
            const result = await roleProcessor.processNightAction();
            
            if (!result.success) {
                console.error(`🌙 NIGHT ACTION ERROR: Failed to process ${currentRole} action: ${result.error}`);
                // Continue processing even if one role fails
            }

            // Apply any game updates from the role processor
            if (result.gameUpdates && Object.keys(result.gameUpdates).length > 0) {
                await db.collection('games').doc(gameId).update(result.gameUpdates);
            }
        }

        // Update the queue (remove the processed role)
        await db.collection('games').doc(gameId).update({
            gameStateProcessQueue: remainingQueue
        });

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

// Wrapped exports with error handling
export const performNightAction = withGameErrorHandling(performNightActionImpl);
export const beginNight = withGameErrorHandling(beginNightImpl);
export const replayNight = withGameErrorHandling(replayNightImpl);