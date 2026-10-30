import { GAME_TEXT_EN, GAME_TEXT_KEYS, eliminationText, gameText, lineHash, nightTurnText, placeholdersOf, roleName } from './index';
import { GAME_TEXT_LOCALES } from './locales';

describe('gameText', () => {
    it('renders English with params when the game has no language, and leaves unknown placeholders readable', () => {
        expect(gameText(undefined, 'day_begins', { day: 3 })).toBe('☀️ **Day 3 begins.**');
        expect(gameText({ language: 'en' }, 'eliminated', { name: 'Cora', role: 'doctor' })).toBe('Cora has been eliminated! They were a doctor.');
        expect(gameText({}, 'eliminated', { name: 'Cora' })).toBe('Cora has been eliminated! They were a {role}.');
    });

    it('renders the static locale line for the game language', () => {
        const ru = GAME_TEXT_LOCALES.ru.lines;
        expect(gameText({ language: 'ru' }, 'day_begins', { day: 2 })).toBe(ru.day_begins!.replace('{day}', '2'));
        expect(gameText({ language: 'ru' }, 'vote_none')).toBe(ru.vote_none);
        expect(gameText({ language: 'ru' }, 'vote_none')).not.toBe(GAME_TEXT_EN.vote_none);
    });

    it('prefers the locale over a legacy per-game pack, uses the pack only where the locale has nothing, then English', () => {
        const legacy = { language: 'ru', gameText: { day_begins: 'LEGACY {day}', vote_none: '   ' } };
        expect(gameText(legacy, 'day_begins', { day: 2 })).toBe(GAME_TEXT_LOCALES.ru.lines.day_begins!.replace('{day}', '2'));
        // An unknown language with a pack: the pack line, else English per key.
        const packOnly = { language: 'xx', gameText: { day_begins: '☀️ **Le jour {day} commence.**', vote_none: '   ' } };
        expect(gameText(packOnly, 'day_begins', { day: 2 })).toBe('☀️ **Le jour 2 commence.**');
        expect(gameText(packOnly, 'vote_none')).toBe(GAME_TEXT_EN.vote_none);
        expect(gameText(packOnly, 'day_outro')).toBe(GAME_TEXT_EN.day_outro);
    });

    it('night turns and eliminations are whole lines per role, with a composed fallback for a role without one', () => {
        expect(nightTurnText(undefined, 'werewolf', true)).toBe("🌙 **Night Phase**: It's time for the werewolves to act. Can eliminate other players during the night.");
        expect(nightTurnText(undefined, 'werewolf', false)).toMatch(/for the werewolf to act/);
        expect(nightTurnText(undefined, 'doctor')).toMatch(/for the doctor to act\. Can protect/);
        expect(nightTurnText({ language: 'fr' }, 'doctor')).toBe(GAME_TEXT_LOCALES.fr.lines.night_turn_doctor);
        expect(nightTurnText(undefined, 'jester')).toBe("🌙 **Night Phase**: It's time for the jester to act. .");

        expect(eliminationText(undefined, 'Cora', 'doctor')).toBe('Cora has been eliminated! They were a doctor.');
        expect(eliminationText({ language: 'fr' }, 'Cora', 'doctor')).toBe(GAME_TEXT_LOCALES.fr.lines.eliminated_doctor!.replace('{name}', 'Cora'));
        const jester = eliminationText({ language: 'fr' }, 'Cora', 'jester');
        expect(jester).toContain('Cora');
        expect(jester).toContain('jester');
    });

    it('roleName uses the locale, pluralizes werewolves, and passes an unknown role through', () => {
        const de = GAME_TEXT_LOCALES.de.lines;
        expect(roleName({ language: 'de' }, 'werewolf')).toBe(de.role_werewolf);
        expect(roleName({ language: 'de' }, 'werewolf', true)).toBe(de.role_werewolves);
        expect(roleName({ language: 'de' }, 'werewolf', true)).not.toBe(roleName({ language: 'de' }, 'werewolf'));
        expect(roleName(undefined, 'doctor')).toBe('doctor');
        expect(roleName({ language: 'de' }, 'jester')).toBe('jester');
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

    it('lineHash is stable, short and sensitive to a one-character edit', () => {
        expect(lineHash('Night falls over the village.')).toBe(lineHash('Night falls over the village.'));
        expect(lineHash('Night falls over the village.')).toMatch(/^[0-9a-f]{8}$/);
        expect(lineHash('Night falls over the village.')).not.toBe(lineHash('Night falls over the village!'));
    });
});
