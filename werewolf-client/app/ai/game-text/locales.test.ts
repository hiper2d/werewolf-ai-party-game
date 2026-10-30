/**
 * The contract every locale file must meet. A failure here names the language and the
 * key; the fix is `npx tsx --env-file=.env scripts/translate-game-text.ts` (fills missing
 * and stale lines) or a hand edit of the JSON.
 */
import { GAME_LANGUAGES } from '../game-language';
import { GAME_TEXT_EN, GAME_TEXT_KEYS, lineHash, placeholdersOf } from './en';
import { GAME_TEXT_LOCALES } from './locales';

const NON_ENGLISH = GAME_LANGUAGES.filter(l => l.code !== 'en').map(l => l.code);

describe('game text locales', () => {
    it('every non-English game language has a locale file, and no file is for an unknown language', () => {
        expect(Object.keys(GAME_TEXT_LOCALES).sort()).toEqual([...NON_ENGLISH].sort());
        for (const [code, locale] of Object.entries(GAME_TEXT_LOCALES)) {
            expect(locale.language).toBe(code);
        }
    });

    describe.each(NON_ENGLISH)('%s', (code) => {
        const locale = GAME_TEXT_LOCALES[code];

        it('has every key of the English source and no others', () => {
            const missing = GAME_TEXT_KEYS.filter(key => typeof locale.lines[key] !== 'string' || !locale.lines[key]!.trim());
            const extra = Object.keys(locale.lines).filter(key => !(key in GAME_TEXT_EN));
            expect({ missing, extra }).toEqual({ missing: [], extra: [] });
        });

        it('keeps the placeholders of each English line', () => {
            const broken = GAME_TEXT_KEYS
                .filter(key => typeof locale.lines[key] === 'string')
                .filter(key => placeholdersOf(locale.lines[key]!).join(',') !== placeholdersOf(GAME_TEXT_EN[key]).join(','))
                .map(key => `${key}: ${locale.lines[key]}`);
            expect(broken).toEqual([]);
        });

        it('was translated from the current English line (stale translations fail until re-run)', () => {
            const stale = GAME_TEXT_KEYS.filter(key => locale.sources[key] !== lineHash(GAME_TEXT_EN[key]));
            expect(stale).toEqual([]);
        });

        it('is not English left in place', () => {
            // Short labels and emoji-only lines may legitimately coincide; the long prose lines never do.
            const longKeys = GAME_TEXT_KEYS.filter(key => GAME_TEXT_EN[key].length > 40);
            const untouched = longKeys.filter(key => locale.lines[key] === GAME_TEXT_EN[key]);
            expect(untouched).toEqual([]);
        });
    });
});
