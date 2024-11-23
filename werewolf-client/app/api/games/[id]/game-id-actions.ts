'use server'

import {db} from "@/firebase/server";
import {GAME_STATES} from "@/app/api/game-models";
import {createMessage, getGame} from "@/app/api/game-actions";

export async function welcome(gameId: string) {
    if (!db) {
        throw new Error('Firestore is not initialized');
    }

    const game = await getGame(gameId);
    if (!game) {
        throw new Error('Game not found');
    }

    try {
        // Create welcome message
        /*await createMessage(
            gameId,
            `Welcome to ${game.theme}! The game is about to begin. ${game.story}`,
            'Game Master'
        );*/

        // Update game state to next state (probably DAY_DISCUSSION)
        /*await db.collection('games').doc(gameId).update({
            gameState: GAME_STATES.DAY_DISCUSSION
        });*/

        return "ok";
    } catch (error) {
        console.error('Error in welcome function:', error);
        throw error;
    }
}