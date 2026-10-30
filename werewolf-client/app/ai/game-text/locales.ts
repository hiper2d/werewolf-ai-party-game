/**
 * The translated fixed lines, one JSON file per game language (GAME_LANGUAGES minus
 * English). Static on purpose (2026-10-30): until then a cheap model translated the lines
 * at preview time for every non-English game, which cost a call per game, produced a
 * different wording each time, dropped the Chinese vote tally line (no plural → it wrote
 * "1票" and lost {count}) and once used the Japanese word for werewolf in a Chinese game.
 * A reviewed file ships the same correct line to every game, and the locale test refuses a
 * missing, stale or placeholder-broken line before it can.
 *
 * File shape (written by scripts/translate-game-text.ts, hand edits welcome):
 *   { "language": "de", "lines": { key: text }, "sources": { key: lineHash(English) } }
 */
import type { GameTextKey } from './en';
import de from './locales/de.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import it from './locales/it.json';
import ja from './locales/ja.json';
import ko from './locales/ko.json';
import nl from './locales/nl.json';
import pl from './locales/pl.json';
import pt from './locales/pt.json';
import ru from './locales/ru.json';
import tr from './locales/tr.json';
import uk from './locales/uk.json';
import zh from './locales/zh.json';

export interface GameTextLocale {
    /** ISO 639-1 code, matching GAME_LANGUAGES. */
    language: string;
    /** The translated lines, same keys and {placeholders} as GAME_TEXT_EN. */
    lines: Partial<Record<GameTextKey, string>>;
    /** lineHash of the English line each translation was made from. */
    sources: Partial<Record<GameTextKey, string>>;
}

const asLocale = (value: unknown) => value as GameTextLocale;

/** Every non-English locale, keyed by language code. English is GAME_TEXT_EN itself. */
export const GAME_TEXT_LOCALES: Readonly<Record<string, GameTextLocale>> = Object.freeze({
    de: asLocale(de), es: asLocale(es), fr: asLocale(fr), it: asLocale(it), ja: asLocale(ja),
    ko: asLocale(ko), nl: asLocale(nl), pl: asLocale(pl), pt: asLocale(pt), ru: asLocale(ru),
    tr: asLocale(tr), uk: asLocale(uk), zh: asLocale(zh),
});

/** The locale for a game language; undefined for English, an unknown code or no file. */
export function gameTextLocale(language: string | undefined | null): GameTextLocale | undefined {
    return language ? GAME_TEXT_LOCALES[language] : undefined;
}
