import {
    DEFAULT_GAME_LANGUAGE,
    GAME_LANGUAGES,
    languageInstruction,
    normalizeGameLanguage,
    replyLanguageLine,
} from './game-language';

describe('game language', () => {
    it('English is the default and gets no prompt block, so English prompts stay byte-identical', () => {
        expect(normalizeGameLanguage(undefined)).toBe(DEFAULT_GAME_LANGUAGE);
        expect(normalizeGameLanguage('')).toBe(DEFAULT_GAME_LANGUAGE);
        expect(normalizeGameLanguage('fr')).toBe('fr');
        expect(() => normalizeGameLanguage('tlh')).toThrow(/Unknown game language/);
        for (const scope of ['story', 'sheets', 'bot', 'gm'] as const) {
            expect(languageInstruction('en', scope)).toBe('');
            expect(languageInstruction(undefined, scope)).toBe('');
        }
        expect(replyLanguageLine('en')).toBe('');
    });

    it('a non-English block names the language and never contains a %placeholder% (format() would refuse it)', () => {
        for (const { code, name } of GAME_LANGUAGES.filter(l => l.code !== 'en')) {
            for (const scope of ['story', 'sheets', 'bot', 'gm'] as const) {
                const block = languageInstruction(code, scope);
                expect(block).toContain(name);
                expect(block).not.toMatch(/%\w+%/);
            }
            expect(replyLanguageLine(code)).toContain(name);
        }
        expect(languageInstruction('fr', 'sheets')).toMatch(/visualDescription.*English/);
        // The cast is named in the game's script: the story block overrides the casting prompt's ASCII rule.
        expect(languageInstruction('ru', 'story')).toMatch(/Name the characters in Russian, in its own script/);
        expect(languageInstruction('ru', 'story')).toMatch(/do not transliterate/);
        expect(languageInstruction('ru', 'bot')).toMatch(/never translated, transliterated, declined or inflected/);
    });
});
