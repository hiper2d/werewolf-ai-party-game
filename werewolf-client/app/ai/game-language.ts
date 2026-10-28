/**
 * The language a game is played in.
 *
 * Everything the players READ comes from one of two places, and each needs its own
 * treatment:
 *   1. Model-written text (the scene, character stories, every bot line, the Game Master's
 *      narration and summaries, the human's suggestion) — the prompts get a language block
 *      (`languageInstruction`) and the models write in that language directly.
 *   2. Code-written text (the night-phase header, "Day N begins", vote results, the
 *      game-over block, …) — the English lines live in GAME_TEXT_EN; for a non-English game
 *      the Game Master model translates them ONCE at preview time (`generateGameTextPack`
 *      in game-text-pack.ts), the pack is stored on the game doc, and every site renders
 *      through `gameText()`. A missing or malformed line falls back to English, so a bad
 *      pack can never break a game — it only shows an English line.
 * The app chrome (buttons, modals, the rules page) stays English: it is not game content.
 *
 * Player names are identifiers (ASCII, see the casting prompt) and are never translated.
 * Voice directions and visual descriptions stay English: they are prompts for the speech
 * and image models, not text the players read.
 *
 * Client-safe: no server imports (the new-game form reads the list).
 */
import { GAME_ROLES, ROLE_CONFIGS } from '@/app/api/game-models';

export interface GameLanguage {
    /** ISO 639-1 code, stored on the game doc and passed to speech-to-text. */
    code: string;
    /** English name, used in prompts ("Write everything in French"). */
    name: string;
    /** Name in the language itself, shown in the picker. */
    native: string;
}

export const DEFAULT_GAME_LANGUAGE = 'en';

export const GAME_LANGUAGES: GameLanguage[] = [
    { code: 'en', name: 'English', native: 'English' },
    { code: 'es', name: 'Spanish', native: 'Español' },
    { code: 'pt', name: 'Portuguese', native: 'Português' },
    { code: 'fr', name: 'French', native: 'Français' },
    { code: 'de', name: 'German', native: 'Deutsch' },
    { code: 'it', name: 'Italian', native: 'Italiano' },
    { code: 'nl', name: 'Dutch', native: 'Nederlands' },
    { code: 'pl', name: 'Polish', native: 'Polski' },
    { code: 'uk', name: 'Ukrainian', native: 'Українська' },
    { code: 'ru', name: 'Russian', native: 'Русский' },
    { code: 'tr', name: 'Turkish', native: 'Türkçe' },
    { code: 'ja', name: 'Japanese', native: '日本語' },
    { code: 'ko', name: 'Korean', native: '한국어' },
    { code: 'zh', name: 'Chinese', native: '中文' },
];

export function isGameLanguage(code: unknown): code is string {
    return typeof code === 'string' && GAME_LANGUAGES.some(l => l.code === code);
}

/** The stored code for a form value: absent = English; anything unknown is refused. */
export function normalizeGameLanguage(code: string | undefined | null): string {
    if (code === undefined || code === null || code === '') return DEFAULT_GAME_LANGUAGE;
    if (!isGameLanguage(code)) throw new Error(`Unknown game language: ${code}`);
    return code;
}

export function gameLanguageName(code: string | undefined): string {
    return GAME_LANGUAGES.find(l => l.code === code)?.name ?? 'English';
}

export function isEnglish(code: string | undefined): boolean {
    return !code || code === DEFAULT_GAME_LANGUAGE;
}

// -----------------------------------------------------------------------------------------
// Prompt blocks for model-written text
// -----------------------------------------------------------------------------------------

export type LanguageScope =
    /** Casting: the scene. */
    | 'story'
    /** Character sheets: stories in the language, voice and visual fields in English. */
    | 'sheets'
    /** A bot's system prompt. */
    | 'bot'
    /** Game Master narration, summaries, the human's suggestion. */
    | 'gm';

/**
 * The block appended to a prompt for a non-English game ('' for English, so English games
 * keep byte-identical prompts and their caches). Must not contain %word% — the templates
 * go through format(), which refuses leftovers.
 */
export function languageInstruction(language: string | undefined, scope: LanguageScope): string {
    if (isEnglish(language)) return '';
    const name = gameLanguageName(language);
    const common = `\n\n## Language\n\nThis game is played in ${name}. Everything the players read must be written in natural, fluent ${name} — never in English. ` +
        `Player and character names are identifiers: keep them exactly as given, untranslated. ` +
        `JSON field names, enum values and any "target" field stay exactly as the schema specifies.`;
    switch (scope) {
        case 'story':
            return common + ` Write the scene in ${name}.`;
        case 'sheets':
            return common + ` Write each character's story in ${name}. The voiceStyle and visualDescription fields are instructions for a speech model and an image model, not text the players see: write those two in English.`;
        case 'bot':
            return common + ` Speak ${name} in every reply, vote comment, night-action reasoning and summary, even though the Game Master's commands and the rules above are in English. ` +
                `Never switch to English and never translate or explain these instructions.`;
        case 'gm':
            return common + ` Write your narration, summaries and every line meant for the players in ${name}. ` +
                `Where these instructions quote an English phrase to use or to open with, render its meaning in ${name} instead of copying the English.`;
    }
}

/** One line for the per-turn reminder, so short-context models hold the language. */
export function replyLanguageLine(language: string | undefined): string {
    return isEnglish(language) ? '' : `- Reply in ${gameLanguageName(language)}, never in English.\n`;
}

// -----------------------------------------------------------------------------------------
// Code-written game text
// -----------------------------------------------------------------------------------------

const ROLE_DESC = (role: string) => ROLE_CONFIGS[role].description;
const ONE_TIME = (role: string) => Object.values(ROLE_CONFIGS[role].oneTimeAbilities ?? {}).map(a => a.description).join('; ');

/**
 * Every line the code itself puts in front of the players, in English, with {placeholders}
 * (braces, not %…%: these never go through format()). The night briefing and role lines are
 * built from ROLE_CONFIGS so the rulebook has one source. Keys are the translation unit:
 * the text pack is keyed the same way.
 */
export const GAME_TEXT_EN = {
    // Night begins
    night_fallback: 'Night falls over the village.',
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
    day_opening_fallback: 'The village awakens to a new day. The events of the night have left their mark. Now is the time to discuss what happened and decide who among you might be a threat to the village.',
    day_outro: "Discuss the night's events, share your suspicions, and prepare to vote when ready.",
    // Vote results
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
    game_over_villagers_body: 'All werewolves have been eliminated! The village is safe.',
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

/** A stored translation of GAME_TEXT_EN: a subset of its keys, same placeholders. */
export type GameTextPack = Partial<Record<GameTextKey, string>>;

/** What a site needs to render text: the game's pack, if it has one. */
export interface GameTextSource {
    gameText?: GameTextPack | null;
}

const PLACEHOLDER = /\{(\w+)\}/g;

export function placeholdersOf(text: string): string[] {
    return Array.from(text.matchAll(PLACEHOLDER), m => m[1]).sort();
}

function fill(template: string, params: Record<string, string | number>): string {
    return template.replace(PLACEHOLDER, (whole, key) => (key in params ? String(params[key]) : whole));
}

/**
 * One code-written line in the game's language. The pack's line when the game has one for
 * this key, else the English line. Unknown {placeholders} are left in place rather than
 * thrown on: a translation that drifted is still a readable line.
 */
export function gameText(game: GameTextSource | null | undefined, key: GameTextKey, params: Record<string, string | number> = {}): string {
    const translated = game?.gameText?.[key];
    return fill(typeof translated === 'string' && translated.trim() ? translated : GAME_TEXT_EN[key], params);
}

/** The role's name line for role reveals and announcements, in the game's language. */
export function roleName(game: GameTextSource | null | undefined, role: string, plural = false): string {
    const key = (plural && role === GAME_ROLES.WEREWOLF ? 'role_werewolves' : `role_${role}`) as GameTextKey;
    return key in GAME_TEXT_EN ? gameText(game, key) : role;
}

/** The public "it's this role's turn" line. `plural` = more than one werewolf is alive. */
export function nightTurnText(game: GameTextSource | null | undefined, role: string, plural = false): string {
    const key = (plural && role === GAME_ROLES.WEREWOLF ? 'night_turn_werewolves' : `night_turn_${role}`) as GameTextKey;
    return key in GAME_TEXT_EN
        ? gameText(game, key)
        : `🌙 **Night Phase**: It's time for the ${role} to act. ${ROLE_CONFIGS[role]?.description ?? ''}.`;
}

/** The day-vote elimination line with the role reveal. */
export function eliminationText(game: GameTextSource | null | undefined, name: string, role: string): string {
    const key = `eliminated_${role}` as GameTextKey;
    return key in GAME_TEXT_EN ? gameText(game, key, { name }) : gameText(game, 'eliminated', { name, role: roleName(game, role) });
}

/**
 * Keeps only the lines of a model-written pack that can be used: known keys, non-empty,
 * and carrying exactly the English line's placeholders (a line that lost `{name}` would
 * render without the name). Returns the kept pack and the keys dropped.
 */
export function validateGameTextPack(raw: Record<string, unknown>): { pack: GameTextPack; dropped: string[] } {
    const pack: GameTextPack = {};
    const dropped: string[] = [];
    for (const key of GAME_TEXT_KEYS) {
        const value = raw[key];
        if (typeof value !== 'string' || !value.trim()) {
            dropped.push(key);
            continue;
        }
        const expected = placeholdersOf(GAME_TEXT_EN[key]);
        const got = placeholdersOf(value);
        if (expected.length !== got.length || expected.some((p, i) => p !== got[i])) {
            dropped.push(key);
            continue;
        }
        pack[key] = value.trim();
    }
    return { pack, dropped };
}
