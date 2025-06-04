'use server';

import {db} from "@/firebase/server";
import {
    Game,
    GAME_STATES,
    BotResponseError
} from "@/app/api/game-models";
import {auth} from "@/auth";
import {getGame} from "./game-actions";

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