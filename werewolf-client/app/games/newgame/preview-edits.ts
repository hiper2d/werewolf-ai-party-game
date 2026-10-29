import type {BotPreview, GamePreviewWithGeneratedBots} from '@/app/api/game-models';

/**
 * What the player changed on the preview page between the generated cast and
 * Create. Counts, not text: the `game_created` feature event carries them so
 * we can read how often the generated names and stories are kept as written.
 * `details` counts bots whose play style, appearance, voice or voice direction
 * changed; model picks are not edits of the cast and are left out.
 */
export interface PreviewEdits {
    editedNames: number;
    editedStories: number;
    editedDetails: number;
    editedScene: boolean;
}

const DETAIL_FIELDS: (keyof BotPreview)[] = ['playStyle', 'visualDescription', 'voice', 'voiceStyle'];

/**
 * Compare the preview as it came back from the server with what Create sends.
 * Bots are matched by position: the cast list cannot add, remove or reorder
 * players. Without a baseline (should not happen) everything reads as kept.
 */
export function previewEdits(
    baseline: GamePreviewWithGeneratedBots | null,
    current: GamePreviewWithGeneratedBots,
): PreviewEdits {
    const edits: PreviewEdits = {editedNames: 0, editedStories: 0, editedDetails: 0, editedScene: false};
    if (!baseline) {
        return edits;
    }
    edits.editedScene = (baseline.scene ?? '') !== (current.scene ?? '');
    current.bots.forEach((bot, index) => {
        const was = baseline.bots[index];
        if (!was) {
            return;
        }
        if (was.name !== bot.name) edits.editedNames++;
        if (was.story !== bot.story) edits.editedStories++;
        if (DETAIL_FIELDS.some(field => (was[field] ?? '') !== (bot[field] ?? ''))) edits.editedDetails++;
    });
    return edits;
}
