/**
 * Pure vote-resolution helpers extracted from voteImpl so the elimination
 * rules can be unit tested without Firestore or LLM mocks.
 */

/**
 * Pick the player eliminated by a day vote.
 *
 * Rules (preserved exactly from the original inline logic in voteImpl):
 * - The player with the most votes is eliminated.
 * - On a tie, a random tied BOT is eliminated — the human player is never
 *   eliminated by a tie-break, only by an outright vote majority.
 * - If somehow all tied players are the human (degenerate case), the first
 *   tied player is returned.
 *
 * Returns null when there are no votes at all.
 */
export function selectEliminatedPlayer(
    votingResults: Record<string, number>,
    humanPlayerName: string | string[],
    random: () => number = Math.random
): string | null {
    const entries = Object.entries(votingResults);
    if (entries.length === 0) {
        return null;
    }

    const maxVotes = Math.max(...entries.map(([, count]) => count));
    const topPlayers = entries
        .filter(([, count]) => count === maxVotes)
        .map(([name]) => name);

    if (topPlayers.length === 1) {
        return topPlayers[0];
    }

    // Every person at the table is spared by a tie-break, not only the first.
    const humans = new Set(Array.isArray(humanPlayerName) ? humanPlayerName : [humanPlayerName]);
    const nonHumanTiedPlayers = topPlayers.filter(name => !humans.has(name));
    if (nonHumanTiedPlayers.length > 0) {
        return nonHumanTiedPlayers[Math.floor(random() * nonHumanTiedPlayers.length)];
    }

    return topPlayers[0];
}
