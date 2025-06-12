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

/**
 * Handles the "Start Night" button click
 * Validates the game is in VOTE_RESULTS state and transitions to NIGHT_BEGINS
 */
export async function startNight(gameId: string): Promise<Game> {
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
            'Invalid game state for starting night',
            `Game must be in VOTE_RESULTS state to start night. Current state: ${game.gameState}`,
            { 
                currentState: game.gameState, 
                expectedState: GAME_STATES.VOTE_RESULTS,
                gameId 
            },
            true
        );
    }

    try {
        // Update game state and clear queues
        await db.collection('games').doc(gameId).update({
            gameState: GAME_STATES.NIGHT_BEGINS,
            gameStateProcessQueue: [],
            gameStateParamQueue: []
        });

        // Return the updated game state
        return await getGame(gameId) as Game;
    } catch (error) {
        console.error('Error in startNight function:', error);
        
        // Re-throw BotResponseError as-is for frontend handling
        if (error instanceof BotResponseError) {
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

/**
 * Begins the night phase by setting up role actions based on configuration
 * Validates the game is in VOTE_RESULTS state and transitions through night preparation
 */
export async function beginNight(gameId: string): Promise<Game> {
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
            gameState: GAME_STATES.NIGHT_BEGINS,
            gameStateProcessQueue: sortedNightRoles,
            gameStateParamQueue: []
        });

        console.log(`🌙 NIGHT BEGINS: Set up night actions for ${sortedNightRoles.length} roles: ${sortedNightRoles.join(', ')}`);

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
export async function replayNight(gameId: string): Promise<Game> {
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
    if (game.gameState !== GAME_STATES.NIGHT_BEGINS) {
        throw new BotResponseError(
            'Invalid game state for replaying night',
            `Game must be in NIGHT_BEGINS state to replay night. Current state: ${game.gameState}`,
            { 
                currentState: game.gameState, 
                expectedState: GAME_STATES.NIGHT_BEGINS,
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