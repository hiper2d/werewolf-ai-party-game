/**
 * Helper mode: callouts on the screen that say what the player can do right now. On for
 * games with `helperMode` (every ready-made story, see app/utils/starter-games.ts), off for
 * games made with the form. UI chrome only: the Game Master's lines, the prompts and the
 * caches are untouched, and the text is English like the rest of the interface.
 *
 * Pure: `visibleHelperHints` is the whole decision, so every case is tested without a
 * browser. A hint with a `target` is a callout that points at that element (the element
 * carries `data-hint="<target>"`); one without is a line above the composer. Every hint
 * that fits the moment and has not been dismissed shows, so two callouts can point at two
 * things at once.
 *
 * The set is built ONE STEP AT A TIME with Alex, who plays a game after each step and
 * decides what the next hint is (2026-11-26). Do not add hints on your own. Wording is
 * player-facing copy on every first game: review an edit like a News entry.
 */

export interface HelperHintState {
    gameState: string;
    currentDay: number;
    humanAlive: boolean;
    /** Chat messages the human has sent on the current day. */
    humanMessagesToday: number;
}

/** Elements a hint can point at: the header's mute button, the message input. */
export type HelperHintTarget = 'mute' | 'composer';

export interface HelperHint {
    /** Stable: dismissals are stored under it. */
    id: string;
    text: string;
    /** The element the hint points at, by its `data-hint` value. None: a line above the composer. */
    target?: HelperHintTarget;
    /** A link under the hint, where there is a next page to go to. */
    link?: {label: string; href: string};
}

/** Every hint that fits the moment. */
export function helperHintsFor(state: HelperHintState): HelperHint[] {
    // The first screen of a story game, once the opening scene is closed: the player has
    // heard the introductions and has not written yet.
    if (state.gameState === 'DAY_DISCUSSION' && state.currentDay === 1 && state.humanAlive && state.humanMessagesToday === 0) {
        return [
            {id: 'voices', target: 'mute', text: 'This mutes and unmutes the voices for the whole game.'},
            {id: 'introduce', target: 'composer', text: 'Introduce yourself to the other players.'},
        ];
    }
    return [];
}

/** The hints to show now: every fitting one the player has not dismissed. */
export function visibleHelperHints(state: HelperHintState, dismissed: ReadonlySet<string>): HelperHint[] {
    return helperHintsFor(state).filter(hint => !dismissed.has(hint.id));
}
