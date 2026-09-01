import {Game} from "@/app/api/game-models";

/**
 * The GM's plot memory as prompt text: the opening scene plus the per-night
 * chapter summaries. Bounded — chapters are 2-4 sentences each and a game
 * lasts a handful of days, so this never needs compaction.
 */
export function buildStoryContext(game: Game): string {
    const parts: string[] = [];
    if (game.story) {
        parts.push(`**Opening scene:**\n${game.story}`);
    }
    const chapters = [...(game.storyChapters || [])].sort((a, b) => a.day - b.day);
    if (chapters.length > 0) {
        parts.push(chapters.map(c => `**Chapter (Day ${c.day}):** ${c.summary}`).join('\n'));
    }
    return parts.length > 0 ? parts.join('\n\n') : 'NONE — this is the very first night of the tale.';
}

/**
 * The latest chapter only — what bots get as "the story so far" flavor.
 * Empty string when no chapter exists yet (day 1).
 */
export function latestChapterSummary(game: Game): string {
    const chapters = game.storyChapters || [];
    if (chapters.length === 0) return '';
    return chapters.reduce((a, b) => (b.day > a.day ? b : a)).summary;
}

/**
 * One line describing today's vote outcome for the GM's story calls.
 */
export function lynchSummaryForDay(game: Game, day: number): string {
    const vote = (game.votingHistory || []).find(v => v.day === day);
    if (!vote) return 'NONE — no vote took place today.';
    if (!vote.eliminatedPlayer) return 'The vote ended without an elimination.';
    return `${vote.eliminatedPlayer} was voted out by the players and revealed to be: ${vote.eliminatedPlayerRole}.`;
}

/**
 * Strips player names out of a narrative hint before it reaches the GM.
 * A hint is anonymous mood/imagery by contract, but a model may still name its
 * target ("I slipped into Elara's house") — woven into the narrative that would
 * expose the doctor's/detective's/maniac's secret target. Every player name
 * (alive or dead, plus the human) is replaced rather than trusted.
 */
export function sanitizeNarrativeHint(hint: string, game: Game): string {
    let result = hint;
    const names = [...game.bots.map(b => b.name), game.humanPlayerName].filter(Boolean);
    for (const name of names) {
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        result = result.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), 'someone');
    }
    return result;
}
