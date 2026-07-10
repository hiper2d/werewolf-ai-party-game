import {Game, GameActionResponse} from "@/app/api/game-models";
import {logger} from "@/app/utils/logger";

/**
 * Benign no-op response for a stale or duplicate game action: a request that
 * lost a race against a state transition (double-click, second tab, or an
 * action dispatched against a game state that had already advanced). The
 * caller returns the current game unchanged so the client re-syncs, instead
 * of throwing — a throw would persist an errorState and show the player a
 * misleading "AI model call failed" banner.
 *
 * Logged at warn level with the STALE_ACTION prefix so occurrences stay
 * queryable in BetterStack without polluting error-level counts.
 */
export function staleActionNoOp(fn: string, reason: string, game: Game): GameActionResponse {
    logger.warn(`STALE_ACTION ${fn}: ${reason}`, {
        gameId: game.id,
        function: fn,
        gameState: game.gameState,
        processQueue: game.gameStateProcessQueue,
        paramQueue: game.gameStateParamQueue,
    });
    return { game, messages: [] };
}
