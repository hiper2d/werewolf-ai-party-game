/**
 * "Retry with different model" (error banner) — what the chosen model does to the game.
 *
 * Pure helpers, kept out of the `'use server'` action file so the UI and tests can share them.
 */
import { GAME_MASTER, GAME_STATES, type Game } from '@/app/api/game-models';

/**
 * A bot's failed NIGHT action is retried without changing its stored model: the banner
 * never names the bot then (only the role), so a model switch in the players list would
 * reveal who holds the hidden role (maniac, doctor, detective, werewolf). Everywhere else
 * the failing player is on screen already and the switch is permanent. The Game Master
 * has no hidden role, so its night narration failures switch permanently too.
 */
export function isHiddenRoleRetry(gameState: string, target: string): boolean {
    return gameState === GAME_STATES.NIGHT && target !== GAME_MASTER;
}

export type RetryModelPatch = {
    permanent: boolean;
    errorState: null;
    retryHint: null;
    modelOverride: Game['modelOverride'];
    bots?: Game['bots'];
    gameMasterAiType?: string;
};

/**
 * The Firestore patch for "Retry with different model": the chosen model becomes the
 * target's model for the rest of the game (bot `aiType` / `gameMasterAiType`), or — for a
 * hidden role's night action — a one-shot `modelOverride` consumed by the retried request
 * only. Either way the error state and any leftover retry hint are cleared in the same
 * write so the auto-processing effects re-run the failed action.
 */
export function retryModelPatch(
    game: Pick<Game, 'gameState' | 'bots' | 'gameMasterAiType'>,
    target: string,
    model: string,
    enableThinking?: boolean
): RetryModelPatch {
    const clear = { errorState: null, retryHint: null } as const;
    if (isHiddenRoleRetry(game.gameState, target)) {
        return { permanent: false, ...clear, modelOverride: { botName: target, model, enableThinking: enableThinking ?? false } };
    }
    if (target === GAME_MASTER) {
        return { permanent: true, ...clear, modelOverride: null, gameMasterAiType: model };
    }
    const bots = game.bots.map(b => (b.name === target ? { ...b, aiType: model, enableThinking: enableThinking ?? false } : b));
    return { permanent: true, ...clear, modelOverride: null, bots };
}
