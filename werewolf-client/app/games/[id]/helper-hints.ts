/**
 * Helper hints: callouts on the screen that say what the player can do. Two ways to see them:
 *
 *  - AS THEY PLAY, in games with `helperMode` (every ready-made story, see
 *    app/utils/starter-games.ts): each hint pops up at its own moment (`helperHintsFor`)
 *    until the player retires it.
 *  - THE TOUR, in every game: the "?" button in the chat header walks through the whole
 *    catalog (`HELPER_HINTS`), one hint at a time, whatever the game's stage. A hint whose
 *    element is not on screen shows as a card with its `when` line instead of an arrow.
 *
 * UI chrome only: the Game Master's lines, the prompts and the caches are untouched, and
 * the text is English like the rest of the interface. Everything here is pure, so every
 * case is tested without a browser. A hint points at the element that carries
 * `data-hint="<target>"`.
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
 * conversation buttons, the icons on the right of the open input, the side panel's Vote
 * button, the header's "?" button that replays the hints.
 */
export type HelperHintTarget = 'mute' | 'composer' | 'player' | 'talk' | 'compose-tools' | 'vote' | 'help';

export interface HelperHint {
    /** Stable: retirements are stored under it. */
    id: string;
    text: string;
    target: HelperHintTarget;
    /** Shown in the tour when the element is not on screen: the moment the hint belongs to. */
    when: string;
}

/** The input's icons are explained the third time the player opens it. */
export const HINT_COMPOSER_OPENS = 3;

/**
 * Retired by the buttons it explains (Go on, Select Bots Automatically, Select Bots
 * Manually) as well as by "Got it": a player who has pressed one never sees it.
 */
export const HINT_TALK_WITHOUT_TYPING = 'talk_without_typing';

/** The catalog, in the order the tour plays it (the order a first game meets them). */
export const HELPER_HINTS: readonly HelperHint[] = [
    {id: 'voices', target: 'mute', when: 'Any time', text: 'This mutes and unmutes the voices for the whole game.'},
    {id: 'introduce', target: 'composer', when: 'During the day discussion', text: 'Introduce yourself to the other players.'},
    {id: 'player_card', target: 'player', when: 'Any time', text: 'Click on a player to see their card or change their model.'},
    {id: HINT_TALK_WITHOUT_TYPING, target: 'talk', when: 'During the day discussion, when nobody is answering', text: 'You can keep the conversation going without typing: these buttons let the others talk.'},
    {id: 'compose_tools', target: 'compose-tools', when: 'When the message box is open', text: 'Auto-generate your answer or use your own voice.'},
    {id: 'vote_open', target: 'vote', when: 'During the day discussion, once it is half done', text: 'You can end the day’s discussion and begin the vote. At 100% the vote begins automatically.'},
];

/**
 * Not in the tour: shown once, the first time a player turns the hints off, pointing at
 * the button that brings them back.
 */
export const HINTS_OFF_HINT: HelperHint = {
    id: 'hints_off', target: 'help', when: 'Any time',
    text: 'Hints are off. Press this to see them again any time.',
};

const byId = (id: string): HelperHint => HELPER_HINTS.find(hint => hint.id === id)!;

/** Every hint whose moment this is, in catalog order. */
export function helperHintsFor(state: HelperHintState): HelperHint[] {
    const day = state.gameState === 'DAY_DISCUSSION';
    const ids = new Set<string>();
    // The first screen of a story game, once the opening scene is closed: the player has
    // heard the introductions and has not written yet.
    if (day && state.currentDay === 1 && state.humanAlive && state.humanMessagesToday === 0) {
        ids.add('voices');
        ids.add('introduce');
    }
    // The player has written and the bots that answer are chosen: while they think, there
    // is time to look around. Stays through day 1 until retired.
    if (day && state.currentDay === 1 && state.humanMessagesToday >= 1 && state.repliesStarted) {
        ids.add('player_card');
    }
    // After the second message, once the table is quiet again: the player has only ever
    // moved the talk on by typing.
    if (day && state.humanAlive && state.humanMessagesToday >= 2 && !state.busy) {
        ids.add(HINT_TALK_WITHOUT_TYPING);
    }
    // The third time the input is opened: by now the player types every answer by hand.
    if (day && state.humanAlive && state.composerOpen && state.composerOpens >= HINT_COMPOSER_OPENS) {
        ids.add('compose_tools');
    }
    // The Vote buttons have just unlocked.
    if (day && state.voteOpen && !state.busy) {
        ids.add('vote_open');
    }
    return HELPER_HINTS.filter(hint => ids.has(hint.id));
}

/** The hints to show now: every one whose moment this is and that the player has not retired. */
export function visibleHelperHints(state: HelperHintState, retired: ReadonlySet<string>): HelperHint[] {
    return helperHintsFor(state).filter(hint => !retired.has(hint.id));
}

export {byId as helperHintById};
