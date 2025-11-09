import { Game } from '@/app/api/game-models';
import { GameEndChecker } from './game-end-checker';

/**
 * Check if the game has ended based on current conditions
 * Returns an object with isEnded flag and winner if game has ended
 *
 * This function now uses the GameEndChecker class which implements
 * a Strategy pattern to check win conditions one by one.
 */
export function checkGameEndConditions(game: Game): { isEnded: boolean; winner?: 'werewolves' | 'villagers' | 'tie'; reason?: string } {
    const checker = new GameEndChecker();
    return checker.check(game);
}