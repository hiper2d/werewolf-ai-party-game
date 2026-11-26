import {AUTO_VOTE_COEFFICIENT, MIN_VOTE_PROGRESS_PCT} from "@/app/api/game-models";

/**
 * How far the day's discussion has come, as the Vote button shows it: the messages said
 * today against the count at which the game votes on its own (alive players x
 * AUTO_VOTE_COEFFICIENT). `canVote` is the rule that the player may start the vote only
 * from MIN_VOTE_PROGRESS_PCT on.
 */
export function discussionProgress(game: {bots: {isAlive: boolean}[]; dayActivityCounter?: Record<string, number>}): {percentage: number; messagesLeft: number; canVote: boolean} {
    const alivePlayers = game.bots.filter(bot => bot.isAlive).length + 1; // +1 for the human
    const threshold = alivePlayers * AUTO_VOTE_COEFFICIENT;
    const said = Object.values(game.dayActivityCounter || {}).reduce((sum, count) => sum + count, 0);
    const percentage = threshold > 0 ? (said / threshold) * 100 : 0;
    return {percentage, messagesLeft: Math.max(0, threshold - said), canVote: percentage >= MIN_VOTE_PROGRESS_PCT};
}
