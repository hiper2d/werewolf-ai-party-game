/**
 * The English source of every line the CODE puts in front of the players: night and day
 * headers, vote results, role reveals, game-over and post-game text, role names. Model-
 * written text (story, bot lines, narration) is not here — it is produced in the game's
 * language by the models (see app/ai/game-language.ts).
 *
 * Keys are the translation unit. Each locale file (./locales/<code>.json) carries the same
 * keys, plus the hash of the English line each translation was made from, so a changed
 * English line fails the locale test until `scripts/translate-game-text.ts` has run.
 *
 * Lines use {placeholders} (braces, not %…%: these never go through format()). The night
 * briefing and role lines are built from ROLE_CONFIGS so the rulebook has one source.
 */
import { GAME_ROLES, ROLE_CONFIGS } from '@/app/api/game-models';

const ROLE_DESC = (role: string) => ROLE_CONFIGS[role].description;
const ONE_TIME = (role: string) => Object.values(ROLE_CONFIGS[role].oneTimeAbilities ?? {}).map(a => a.description).join('; ');

export const GAME_TEXT_EN = {
    // Night begins
    // Setting-neutral on purpose: a game is a space station or a boarding school as often as a
    // village, so no line names the place (the role is still called villager).
    night_fallback: 'Night falls.',
    night_intro: 'During this phase, players with special abilities will act in this order:',
    night_briefing:
        `• Maniac: ${ROLE_DESC(GAME_ROLES.MANIAC)}.\n` +
        `• Werewolf: ${ROLE_DESC(GAME_ROLES.WEREWOLF)}.\n` +
        `• Doctor: ${ROLE_DESC(GAME_ROLES.DOCTOR)}. Once per game: ${ONE_TIME(GAME_ROLES.DOCTOR)}.\n` +
        `• Detective: ${ROLE_DESC(GAME_ROLES.DETECTIVE)}. Once per game: ${ONE_TIME(GAME_ROLES.DETECTIVE)}.`,
    night_outro: 'The night actions will be processed automatically.',
    // A role's turn (public announcement): one full line per role, never a role name
    // composed into a sentence — articles and plurals differ by language ("au tour du
    // loups-garous" is what the composed form produced). The human werewolf's private
    // pack note follows.
    night_turn_werewolves: `🌙 **Night Phase**: It's time for the werewolves to act. ${ROLE_DESC(GAME_ROLES.WEREWOLF)}.`,
    night_turn_werewolf: `🌙 **Night Phase**: It's time for the werewolf to act. ${ROLE_DESC(GAME_ROLES.WEREWOLF)}.`,
    night_turn_doctor: `🌙 **Night Phase**: It's time for the doctor to act. ${ROLE_DESC(GAME_ROLES.DOCTOR)}.`,
    night_turn_detective: `🌙 **Night Phase**: It's time for the detective to act. ${ROLE_DESC(GAME_ROLES.DETECTIVE)}.`,
    night_turn_maniac: `🌙 **Night Phase**: It's time for the maniac to act. ${ROLE_DESC(GAME_ROLES.MANIAC)}.`,
    pack_note_many: '🐺 **Your pack**: {roster}. Discuss privately before locking in a target.',
    pack_note_alone: '🐺 **Your pack**: {roster}. You are the only werewolf left — pick a target on your own.',
    pack_you: '(You)',
    // Day begins
    day_begins: '☀️ **Day {day} begins.**',
    day_opening_fallback: 'A new day begins. The events of the night have left their mark. Now is the time to discuss what happened and decide who among you might be a threat.',
    day_outro: "Discuss the night's events, share your suspicions, and prepare to vote when ready.",
    // Vote results. A language without grammatical number (Chinese, Japanese, Korean,
    // Turkish after a numeral) translates both tally lines to the same text.
    vote_none: 'No votes were cast during this round.',
    vote_line_one: '{name}: {count} vote',
    vote_line_many: '{name}: {count} votes',
    vote_results: 'Voting results:',
    vote_results_tie: 'Voting results (tie):',
    vote_tie_between: 'There is a tie between {names}!',
    vote_top: '{name} received the most votes and will be eliminated.',
    // One line per role for the same reason as the night turns; `eliminated` is the
    // fallback for a role without its own line.
    eliminated_werewolf: '{name} has been eliminated! They were a werewolf.',
    eliminated_doctor: '{name} has been eliminated! They were a doctor.',
    eliminated_detective: '{name} has been eliminated! They were a detective.',
    eliminated_maniac: '{name} has been eliminated! They were a maniac.',
    eliminated_villager: '{name} has been eliminated! They were a villager.',
    eliminated: '{name} has been eliminated! They were a {role}.',
    // The detective's public result line under the night story
    detective_evil: "🔍 *The detective's investigation revealed evil.*",
    detective_innocent: "🔍 *The detective's investigation found an innocent.*",
    detective_blocked: "🔍 *The detective's investigation revealed nothing.*",
    // Game over
    game_over_human_title: '🎭 **GAME OVER**',
    game_over_human_body: 'The human player has been eliminated from the game.',
    game_over_villagers_title: '🎭 **GAME OVER - VILLAGERS WIN!** 🎉',
    game_over_villagers_body: 'All werewolves have been eliminated! The villagers have won.',
    game_over_werewolves_title: '🎭 **GAME OVER - WEREWOLVES WIN!** 🐺',
    game_over_werewolves_body: 'The werewolves have achieved dominance! They equal or outnumber the remaining villagers.',
    final_roles: '**Final Role Reveals:**',
    alive: '✅ Alive',
    dead: '💀 Dead',
    // Post-game discussion
    post_game_title: '🎭 **GAME OVER - POST-GAME DISCUSSION**',
    post_game_intro: 'The game has ended! All roles are now revealed and **everyone** (including those who were eliminated) can participate in the discussion.',
    post_game_roles: '**Final Roles:**',
    was_eliminated: '(was eliminated)',
    post_game_outro: 'Feel free to share your experiences, reveal your strategies, discuss close calls, and ask questions about what really happened during the game. This is a time for open and honest reflection!',
    // Role names as they appear in the lines above (lowercase, as in role reveals)
    role_werewolf: 'werewolf',
    role_werewolves: 'werewolves',
    role_doctor: 'doctor',
    role_detective: 'detective',
    role_maniac: 'maniac',
    role_villager: 'villager',
} as const;

export type GameTextKey = keyof typeof GAME_TEXT_EN;
export const GAME_TEXT_KEYS = Object.keys(GAME_TEXT_EN) as GameTextKey[];

const PLACEHOLDER = /\{(\w+)\}/g;

/** The placeholder names of a line, sorted — what a translation must carry too. */
export function placeholdersOf(text: string): string[] {
    return Array.from(text.matchAll(PLACEHOLDER), m => m[1]).sort();
}

/** Fills {placeholders}; an unknown one stays in place rather than throwing. */
export function fillPlaceholders(template: string, params: Record<string, string | number>): string {
    return template.replace(PLACEHOLDER, (whole, key) => (key in params ? String(params[key]) : whole));
}

/**
 * Short, stable hash of an English line (FNV-1a, 8 hex chars). A locale stores it next to
 * each translation; a mismatch means the English changed after the translation was made.
 */
export function lineHash(text: string): string {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
}
