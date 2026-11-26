import {SupportedAiModels} from "@/app/ai/ai-models";
import {isStarterModel} from "@/app/ai/model-limit-utils";

/**
 * What a starter game (a pre-built first game, app/utils/starter-games.ts) does not allow,
 * enforced on the server next to the tier rules (docs/plan-growth-roadmap.md, "Limits in
 * starter games"). A starter game is the free sample: nothing in it may cost more than the
 * cheap table it was built for.
 *   - models: the cheapest group only, for bots and the Game Master, on every tier;
 *   - no rewinds: deleting or trimming messages, replaying the night;
 *   - no portrait redraw: its portraits were drawn in advance, several per character.
 * Error recovery (Retry, a different model for a failed turn, moving a refused provider's
 * bots) stays, held to the same models.
 */
type MaybeStarterGame = { starterTemplateId?: string } | undefined | null;

export function isStarterGame(game: MaybeStarterGame): boolean {
    return !!game?.starterTemplateId;
}

export const STARTER_GAME_REWIND_MESSAGE =
    'Rewinds are not available in a starter game. Create your own game to delete messages or replay a night.';
export const STARTER_GAME_REDRAW_MESSAGE =
    'A starter game comes with its portraits already drawn: pick another one on the character card. Create your own game to draw new ones.';

/** Throws when `game` is a starter game and any of `models` is outside the cheapest group. */
export function assertStarterModels(game: MaybeStarterGame, models: string[]): void {
    if (!isStarterGame(game)) return;
    const offender = models.find(model => !isStarterModel(model));
    if (offender) {
        const name = SupportedAiModels[offender]?.displayName ?? offender;
        throw new Error(`${name} is not available in a starter game. Create your own game to use it.`);
    }
}

export function assertNoStarterRewind(game: MaybeStarterGame): void {
    if (isStarterGame(game)) throw new Error(STARTER_GAME_REWIND_MESSAGE);
}

export function assertNoStarterRedraw(game: MaybeStarterGame): void {
    if (isStarterGame(game)) throw new Error(STARTER_GAME_REDRAW_MESSAGE);
}
