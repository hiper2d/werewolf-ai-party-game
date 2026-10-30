/**
 * The language a game is played in.
 *
 * Everything the players READ comes from one of two places, and each needs its own
 * treatment:
 *   1. Model-written text (the scene, character stories, every bot line, the Game Master's
 *      narration and summaries, the human's suggestion) — the prompts get a language block
 *      (`languageInstruction`) and the models write in that language directly.
 *   2. Code-written text (the night-phase header, "Day N begins", vote results, the
 *      game-over block, …) — static, reviewed translations per language in
 *      app/ai/game-text/locales/<code>.json, rendered through `gameText()` from
 *      app/ai/game-text. The locale test keeps every file complete; adding or editing an
 *      English line means running scripts/translate-game-text.ts.
 * The app chrome (buttons, modals, the rules page) stays English: it is not game content.
 *
 * Player names are identifiers (one word of letters and digits in ANY script — name-utils.ts)
 * and are never translated or inflected; a non-English cast is named in the game's own
 * script (the 'story' block below overrides the casting prompt's ASCII rule).
 * Voice directions and visual descriptions stay English: they are prompts for the speech
 * and image models, not text the players read.
 *
 * Client-safe: no server imports (the new-game form reads the list).
 */
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
        `Player and character names are identifiers: copy them letter for letter wherever you write them, in prose and in every JSON field — never translated, transliterated, declined or inflected, with no title or surname added. ` +
        `JSON field names, enum values and any "target" field stay exactly as the schema specifies.`;
    switch (scope) {
        case 'story':
            return common + ` Write the scene in ${name}. Name the characters in ${name}, in its own script, as native speakers would write them (keep the language's own accents and diacritics): one word of letters and digits only, no spaces, apostrophes or hyphens. This replaces the English-ASCII name rule above — do not transliterate names into Latin letters.`;
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
