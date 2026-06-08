import { setGameErrorState, getGame } from '@/app/api/game-actions';
import { SystemErrorMessage, BotResponseError, GameActionResponse, GAME_STATES, Game } from '@/app/api/game-models';
import { isTierMismatchError } from '@/app/api/errors';
import { logger } from '@/app/utils/logger';

/**
 * Best-effort resolution of which bot/model made the failing call, plus the
 * current game state. Used to attribute errors to a specific model without
 * having to grep the stack trace / details string.
 */
async function resolveErrorAttribution(
  gameId: string,
  baseContext: Record<string, any>
): Promise<{ game: Game | null; botName?: string; model?: string; gameState?: string }> {
  let game: Game | null = null;
  try {
    game = await getGame(gameId);
  } catch {
    // Loading the game for attribution must never mask the original error.
  }

  // The bot whose turn failed sits at the head of the relevant queue — the same
  // logic the UI uses to label the failure.
  const queuedBot = game
    ? (game.gameState === GAME_STATES.WELCOME
        ? game.gameStateParamQueue?.[0]
        : game.gameStateProcessQueue?.[0])
    : undefined;

  // Agent-thrown BotResponseError already carries the precise name/model.
  const botName = (baseContext.agentName as string) || (baseContext.botName as string) || queuedBot;

  let model = baseContext.model as string | undefined;
  if (!model && game && botName) {
    model = botName === 'Game Master'
      ? game.gameMasterAiType
      : game.bots.find(b => b.name === botName)?.aiType;
  }

  return { game, botName, model, gameState: game?.gameState };
}

/**
 * Higher-order function that wraps server actions with global error handling.
 * Automatically catches errors and updates the game object with persistent error state.
 * Returns GameActionResponse with the error game state and empty messages array.
 *
 * @param fn - The server action function to wrap
 * @param gameIdExtractor - Function to extract gameId from the arguments
 * @returns Wrapped function that handles errors by updating game state
 */
export function withErrorHandling<T extends any[]>(
  fn: (...args: T) => Promise<GameActionResponse>,
  gameIdExtractor: (...args: T) => string
) {
  return async (...args: T): Promise<GameActionResponse> => {
    try {
      return await fn(...args);
    } catch (error) {
      if (isTierMismatchError(error)) {
        throw error;
      }
      const gameId = gameIdExtractor(...args);

      const baseContext: Record<string, any> = error instanceof BotResponseError
        ? { ...error.context }
        : {};

      // Attribute the failure to a specific bot/model/state so it can be
      // diagnosed without parsing the stack trace or details string.
      const { botName, model, gameState } = await resolveErrorAttribution(gameId, baseContext);

      const errorMessage = error instanceof Error ? error.message : 'Unknown system error occurred';
      const errorDetails = error instanceof BotResponseError
        ? error.details
        : error instanceof Error
          ? error.stack || error.message
          : String(error);
      const recoverable = error instanceof BotResponseError ? error.recoverable : true;

      const context: Record<string, any> = {
        ...baseContext,
        function: fn.name,
        gameId,
        ...(botName ? { botName } : {}),
        ...(model ? { model } : {}),
        ...(gameState ? { gameState } : {}),
        timestamp: new Date().toISOString(),
      };

      // Structured, attributable log (shipped to Better Stack), not just a bare console dump.
      logger.error(`Game action failed: ${fn.name}`, {
        gameId,
        function: fn.name,
        botName,
        model,
        gameState,
        apiProvider: baseContext.apiProvider,
        recoverable,
        error: errorMessage,
        details: errorDetails,
      });
      console.error(
        `Error in ${fn.name} [game=${gameId}${botName ? ` bot=${botName}` : ''}${model ? ` model=${model}` : ''}${gameState ? ` state=${gameState}` : ''}]:`,
        error
      );

      // Convert error to SystemErrorMessage format
      const systemError: SystemErrorMessage = {
        error: errorMessage,
        details: errorDetails,
        context,
        recoverable,
        timestamp: Date.now()
      };

      // Update game with error state and return it wrapped in GameActionResponse
      const errorGame = await setGameErrorState(gameId, systemError);
      return { game: errorGame, messages: [] };
    }
  };
}

/**
 * Convenience wrapper for server actions that take gameId as first parameter
 */
export function withGameErrorHandling<T extends any[]>(
  fn: (gameId: string, ...args: T) => Promise<GameActionResponse>
) {
  return withErrorHandling(fn, (gameId: string, ...args: T) => gameId);
}
