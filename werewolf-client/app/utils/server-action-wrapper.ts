import { setGameErrorState } from '@/app/api/game-actions';
import { SystemErrorMessage, BotResponseError } from '@/app/api/game-models';

/**
 * Higher-order function that wraps server actions with global error handling.
 * Automatically catches errors and updates the game object with persistent error state.
 * 
 * @param fn - The server action function to wrap
 * @param gameIdExtractor - Function to extract gameId from the arguments
 * @returns Wrapped function that handles errors by updating game state
 */
export function withErrorHandling<T extends any[], R>(
  fn: (...args: T) => Promise<R>,
  gameIdExtractor: (...args: T) => string
) {
  return async (...args: T): Promise<R> => {
    try {
      return await fn(...args);
    } catch (error) {
      const gameId = gameIdExtractor(...args);
      
      console.error(`Error in ${fn.name}:`, error);
      
      // Convert error to SystemErrorMessage format
      const systemError: SystemErrorMessage = {
        error: error instanceof BotResponseError 
          ? error.message 
          : error instanceof Error 
            ? error.message 
            : 'Unknown system error occurred',
        details: error instanceof BotResponseError 
          ? error.details 
          : error instanceof Error 
            ? error.stack || error.message
            : String(error),
        context: error instanceof BotResponseError 
          ? error.context 
          : { 
              function: fn.name, 
              gameId,
              timestamp: new Date().toISOString()
            },
        recoverable: error instanceof BotResponseError 
          ? error.recoverable 
          : true, // Default to recoverable for system errors
        timestamp: Date.now()
      };
      
      // Update game with error state and return it
      return await setGameErrorState(gameId, systemError) as R;
    }
  };
}

/**
 * Convenience wrapper for server actions that take gameId as first parameter
 */
export function withGameErrorHandling<T extends any[], R>(
  fn: (gameId: string, ...args: T) => Promise<R>
) {
  return withErrorHandling(fn, (gameId: string, ...args: T) => gameId);
}