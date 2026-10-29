import {
    DEFAULT_GAME_LANGUAGE,
    GAME_LANGUAGES,
    GAME_TEXT_EN,
    GAME_TEXT_KEYS,
    eliminationText,
    gameText,
    languageInstruction,
    nightTurnText,
    normalizeGameLanguage,
    placeholdersOf,
    replyLanguageLine,
    roleName,
    validateGameTextPack,
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

    it('gameText renders English with params when the game has no pack, and leaves unknown placeholders readable', () => {
        expect(gameText(undefined, 'day_begins', { day: 3 })).toBe('☀️ **Day 3 begins.**');
        expect(gameText({ gameText: null }, 'eliminated', { name: 'Cora', role: 'doctor' })).toBe('Cora has been eliminated! They were a doctor.');
        expect(gameText({}, 'eliminated', { name: 'Cora' })).toBe('Cora has been eliminated! They were a {role}.');
    });

    it('night turns and eliminations are whole lines per role, with a composed fallback for a role without one', () => {
        expect(nightTurnText(undefined, 'werewolf', true)).toBe("🌙 **Night Phase**: It's time for the werewolves to act. Can eliminate other players during the night.");
        expect(nightTurnText(undefined, 'werewolf', false)).toMatch(/for the werewolf to act/);
        expect(nightTurnText(undefined, 'doctor')).toMatch(/for the doctor to act\. Can protect/);
        expect(nightTurnText({ gameText: { night_turn_doctor: '🌙 Au tour du docteur.' } }, 'doctor')).toBe('🌙 Au tour du docteur.');
        expect(nightTurnText(undefined, 'jester')).toBe("🌙 **Night Phase**: It's time for the jester to act. .");

        expect(eliminationText(undefined, 'Cora', 'doctor')).toBe('Cora has been eliminated! They were a doctor.');
        expect(eliminationText({ gameText: { eliminated_doctor: '{name} est éliminée ! Elle était médecin.' } }, 'Cora', 'doctor')).toBe('Cora est éliminée ! Elle était médecin.');
        expect(eliminationText({ gameText: { eliminated: '{name} : {role}.', role_werewolf: 'loup' } }, 'Cora', 'jester')).toBe('Cora : jester.');
    });

    it('gameText prefers the pack line and falls back per key, not per pack', () => {
        const game = { gameText: { day_begins: '☀️ **Le jour {day} commence.**', vote_none: '   ' } };
        expect(gameText(game, 'day_begins', { day: 2 })).toBe('☀️ **Le jour 2 commence.**');
        expect(gameText(game, 'vote_none')).toBe(GAME_TEXT_EN.vote_none);
        expect(gameText(game, 'day_outro')).toBe(GAME_TEXT_EN.day_outro);
    });

    it('roleName uses the pack, pluralizes werewolves, and passes an unknown role through', () => {
        const game = { gameText: { role_werewolf: 'loup-garou', role_werewolves: 'loups-garous' } };
        expect(roleName(game, 'werewolf')).toBe('loup-garou');
        expect(roleName(game, 'werewolf', true)).toBe('loups-garous');
        expect(roleName(game, 'doctor')).toBe('doctor');
        expect(roleName(game, 'jester')).toBe('jester');
    });

    it('validateGameTextPack keeps lines with the same placeholders and drops the rest', () => {
        const raw: Record<string, unknown> = {
            ...Object.fromEntries(GAME_TEXT_KEYS.map(k => [k, `x ${GAME_TEXT_EN[k]}`])),
            eliminated: '{name} est éliminé !',               // lost {role}
            vote_top: '{nom} a reçu le plus de voix.',        // renamed placeholder
            day_begins: 'Le jour {day} commence, {day}.',     // duplicated placeholder
            vote_none: '',                                    // empty
            night_outro: 42,                                  // not a string
            extra_key: 'ignored',
        };
        const { pack, dropped } = validateGameTextPack(raw);
        expect(dropped.sort()).toEqual(['day_begins', 'eliminated', 'night_outro', 'vote_none', 'vote_top']);
        expect(Object.keys(pack)).toHaveLength(GAME_TEXT_KEYS.length - 5);
        expect(pack).not.toHaveProperty('extra_key');
        expect(pack.alive).toBe('x ✅ Alive');
    });

    it('every English line is non-empty and its placeholders are the ones the sites fill', () => {
        const expected: Partial<Record<keyof typeof GAME_TEXT_EN, string[]>> = {
            pack_note_many: ['roster'],
            pack_note_alone: ['roster'],
            day_begins: ['day'],
            vote_line_one: ['count', 'name'],
            vote_line_many: ['count', 'name'],
            vote_tie_between: ['names'],
            vote_top: ['name'],
            eliminated_werewolf: ['name'],
            eliminated_doctor: ['name'],
            eliminated_detective: ['name'],
            eliminated_maniac: ['name'],
            eliminated_villager: ['name'],
            eliminated: ['name', 'role'],
        };
        for (const key of GAME_TEXT_KEYS) {
            expect(GAME_TEXT_EN[key].trim()).not.toBe('');
            expect(placeholdersOf(GAME_TEXT_EN[key])).toEqual(expected[key] ?? []);
        }
    });
});
