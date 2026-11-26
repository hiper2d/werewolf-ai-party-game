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
    /** The bots that answer the human's first message of the day are chosen (thinking or done). */
    repliesStarted: boolean;
    /** Bots are answering or an action is running: the conversation buttons are not on screen. */
    busy: boolean;
    /** How many times the player has opened the message input in this game, and whether it is open now. */
    composerOpens: number;
    composerOpen: boolean;
    /** The discussion has reached the share at which the Vote buttons unlock (MIN_VOTE_PROGRESS_PCT). */
    voteOpen: boolean;
}

/**
 * Elements a hint can point at: the header's mute button, the message input, the middle
 * bot's row in the players list (the callout sits to the right of a row), the side panel's
 * conversation buttons, the icons on the right of the open input, the side panel's Vote button.
 */
export type HelperHintTarget = 'mute' | 'composer' | 'player' | 'talk' | 'compose-tools' | 'vote';

/** The input's icons are explained the third time the player opens it. */
export const HINT_COMPOSER_OPENS = 3;

/**
 * Retired by the buttons it explains (Go on, Select Bots Automatically, Select Bots
 * Manually) as well as by "Got it": a player who has pressed one never sees it.
 */
export const HINT_TALK_WITHOUT_TYPING = 'talk_without_typing';

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
    const hints: HelperHint[] = [];
    // The first screen of a story game, once the opening scene is closed: the player has
    // heard the introductions and has not written yet.
    if (state.gameState === 'DAY_DISCUSSION' && state.currentDay === 1 && state.humanAlive && state.humanMessagesToday === 0) {
        hints.push({id: 'voices', target: 'mute', text: 'This mutes and unmutes the voices for the whole game.'});
        hints.push({id: 'introduce', target: 'composer', text: 'Introduce yourself to the other players.'});
    }
    // The player has written and the bots that answer are chosen: while they think, there
    // is time to look around. Stays through day 1 until dismissed.
    if (state.gameState === 'DAY_DISCUSSION' && state.currentDay === 1 && state.humanMessagesToday >= 1 && state.repliesStarted) {
        hints.push({id: 'player_card', target: 'player', text: 'Click on a player to see their card or change their model.'});
    }
    // After the second message, once the table is quiet again: the player has only ever
    // moved the talk on by typing.
    if (state.gameState === 'DAY_DISCUSSION' && state.humanAlive && state.humanMessagesToday >= 2 && !state.busy) {
        hints.push({id: HINT_TALK_WITHOUT_TYPING, target: 'talk', text: 'You can keep the conversation going without typing: these buttons let the others talk.'});
    }
    // The third time the input is opened: by now the player types every answer by hand.
    if (state.gameState === 'DAY_DISCUSSION' && state.humanAlive && state.composerOpen && state.composerOpens >= HINT_COMPOSER_OPENS) {
        hints.push({id: 'compose_tools', target: 'compose-tools', text: 'Auto-generate your answer or use your own voice.'});
    }
    // The Vote buttons have just unlocked.
    if (state.gameState === 'DAY_DISCUSSION' && state.voteOpen && !state.busy) {
        hints.push({id: 'vote_open', target: 'vote', text: 'You can end the day\u2019s discussion and begin the vote. At 100% the vote begins automatically.'});
    }
    return hints;
}

/** The hints to show now: every fitting one the player has not dismissed. */
export function visibleHelperHints(state: HelperHintState, dismissed: ReadonlySet<string>): HelperHint[] {
    return helperHintsFor(state).filter(hint => !dismissed.has(hint.id));
}
