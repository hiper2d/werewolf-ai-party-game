/**
 * Helper mode: one line on the screen that says what the player can do right now. On for
 * games with `helperMode` (every ready-made story, see app/utils/starter-games.ts), off for
 * games made with the form. UI chrome only: the Game Master's lines, the prompts and the
 * caches are untouched, and the text is English like the rest of the interface.
 *
 * Pure: `pickHelperHint` is the whole decision, so every case is tested without a browser.
 * The table is ordered; the first hint that matches and has not been dismissed shows.
 * Wording is player-facing copy on every first game: review an edit like a News entry.
 */

export interface HelperHintState {
    gameState: string;
    currentDay: number;
    humanAlive: boolean;
    /** Chat messages the human has sent on the current day. */
    humanMessagesToday: number;
    werewolfCount: number;
    /** A visitor with no account: their game stops after night 1 and they cannot make their own. */
    isGuest: boolean;
    /** Bots are answering or an action is running: the player can only wait. */
    busy: boolean;
}

export interface HelperHint {
    /** Stable: dismissals are stored under it. */
    id: string;
    text: string;
    /** A link under the hint, where there is a next page to go to. */
    link?: {label: string; href: string};
}

/** After this many messages of their own the player has seen a discussion: point at the vote. */
export const HINT_MESSAGES_BEFORE_VOTE = 3;

const GAME_OVER_STATES = new Set(['GAME_OVER', 'AFTER_GAME_DISCUSSION']);

function wolves(count: number): string {
    if (count === 1) return 'One of these characters is a werewolf';
    const word = ['Two', 'Three', 'Four'][count - 2] ?? String(count);
    return `${word} of these characters are werewolves`;
}

/** Every hint that fits the moment, most specific first. */
export function helperHintsFor(state: HelperHintState): HelperHint[] {
    const {gameState, currentDay, humanAlive, humanMessagesToday, isGuest} = state;

    if (GAME_OVER_STATES.has(gameState)) {
        return [isGuest
            ? {id: 'game_over', text: 'That was one story. Sign in to play the others, or to make your own with any theme and cast.'}
            : {id: 'game_over', text: 'That was one story. Now make your own: any theme, any cast, any models.', link: {label: 'Create a game', href: '/games/newgame'}}];
    }
    if (!humanAlive) {
        return [{id: 'eliminated', text: 'You are out, but the game goes on and you can watch it. Press Go on to let the others talk, and Vote when they have said enough.'}];
    }
    switch (gameState) {
        case 'VOTE':
            return [{id: 'vote', text: 'Pick the character you think is a werewolf and say why. Everyone votes, and the one with the most votes is out.'}];
        case 'VOTE_RESULTS':
            return [{id: 'vote_results', text: 'The character voted out shows their role. Was it a werewolf? Press Start Night when you have read the result.'}];
        case 'NIGHT':
            return [{id: 'night', text: 'Night. The werewolves choose a victim, the doctor protects someone, the detective checks someone. You are a villager, so you sleep.'}];
        case 'NIGHT_RESULTS':
            return [isGuest
                ? {id: 'night_results', text: 'Read what happened in the night. Day 2 is where the game opens up: sign in to keep playing this game.'}
                : {id: 'night_results', text: 'Read what happened in the night, then press Next Day. Someone at the table may be gone.'}];
        case 'DAY_DISCUSSION': {
            if (state.busy) return [];
            const hints: HelperHint[] = [];
            if (currentDay >= 2 && humanMessagesToday === 0) {
                hints.push({id: `new_day_${currentDay}`, text: 'A new day. Use what the night showed you: who was accused yesterday, who defended whom, who has gone quiet?'});
            }
            if (currentDay === 1 && humanMessagesToday === 0) {
                hints.push({id: 'first_message', text: `${wolves(state.werewolfCount)}, and nobody knows who. Ask someone a question, or say who you suspect: they answer when you write.`});
            }
            if (humanMessagesToday >= 1 && humanMessagesToday < HINT_MESSAGES_BEFORE_VOTE) {
                hints.push({id: 'mention', text: 'Write a character’s name to make that one answer you. Go on lets the others keep talking without you.'});
            }
            if (humanMessagesToday >= HINT_MESSAGES_BEFORE_VOTE) {
                hints.push({id: `start_vote_${currentDay}`, text: 'Heard enough? Press Vote to end the discussion. The number on the button is how much of the day is left.'});
            }
            return hints;
        }
        default:
            return [];
    }
}

/** The hint to show now, or null: the first fitting one the player has not dismissed. */
export function pickHelperHint(state: HelperHintState, dismissed: ReadonlySet<string>): HelperHint | null {
    return helperHintsFor(state).find(hint => !dismissed.has(hint.id)) ?? null;
}
