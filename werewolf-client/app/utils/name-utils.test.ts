import { duplicateNameErrors, playerNameKey, sanitizePlayerName, validatePlayerName, VALID_NAME_PATTERN } from './name-utils';

describe('playerNameKey', () => {
    it('folds case and sanitizes, so "Zacharybook" and "zachary book" are the same player', () => {
        expect(playerNameKey('Zacharybook')).toBe('zacharybook');
        expect(playerNameKey('zachary book ')).toBe('zacharybook');
    });

    it('folds case in other scripts too', () => {
        expect(playerNameKey('ИВАН')).toBe('иван');
        expect(playerNameKey('Émile')).toBe('émile');
    });
});

describe('duplicateNameErrors', () => {
    it('is empty for a unique table', () => {
        expect(duplicateNameErrors('Alex', ['Bot1', 'Bot2', 'Bot3'])).toEqual({});
    });

    it('flags every bot carrying the human name', () => {
        expect(duplicateNameErrors('Zacharybook', ['zacharybook', 'Mira', 'ZACHARYBOOK'])).toEqual({
            0: '"zacharybook" is your name — every player needs a different one',
            2: '"ZACHARYBOOK" is your name — every player needs a different one',
        });
    });

    it('flags both sides of a bot-bot clash, the first with a distinct message', () => {
        expect(duplicateNameErrors('Alex', ['Mira', 'Theo', 'mira ', 'Theo'])).toEqual({
            0: '"Mira" is used by more than one player',
            2: '"mira" is already taken by another player',
            1: '"Theo" is used by more than one player',
            3: '"Theo" is already taken by another player',
        });
    });

    it('ignores names that sanitize to nothing (rejected elsewhere)', () => {
        expect(duplicateNameErrors('Alex', ['!!!', '---', 'Mira'])).toEqual({});
    });

    it('sees the same Cyrillic name typed with different composition as one player', () => {
        expect(duplicateNameErrors('Алекс', ['алекс', 'Йосип', 'Йосип'.normalize('NFD')])).toEqual({
            0: '"алекс" is your name — every player needs a different one',
            1: '"Йосип" is used by more than one player',
            2: `"${'Йосип'.normalize('NFD')}" is already taken by another player`,
        });
    });
});

describe('sanitizePlayerName', () => {
    it('strips trailing/leading whitespace', () => {
        expect(sanitizePlayerName('DeepSeekFlash ')).toBe('DeepSeekFlash');
        expect(sanitizePlayerName('  PLD  ')).toBe('PLD');
    });

    it('removes internal spaces and punctuation', () => {
        expect(sanitizePlayerName('Deep Seek Flash')).toBe('DeepSeekFlash');
        expect(sanitizePlayerName('Bot-99!')).toBe('Bot99');
        expect(sanitizePlayerName("O'Brien")).toBe('OBrien');
    });

    it('keeps accents and other scripts (a game played in Russian or Japanese names its players in them)', () => {
        expect(sanitizePlayerName('Renée')).toBe('Renée');
        expect(sanitizePlayerName('Jürgen')).toBe('Jürgen');
        expect(sanitizePlayerName('日本語')).toBe('日本語');
        expect(sanitizePlayerName('Игрок7')).toBe('Игрок7');
        expect(sanitizePlayerName('Марія Олена')).toBe('МаріяОлена');
    });

    it('composes to NFC so the two ways of typing "é" give one name', () => {
        const decomposed = 'Renée';
        expect(sanitizePlayerName(decomposed)).toBe('Renée');
        expect(sanitizePlayerName(decomposed)).toBe(sanitizePlayerName('Renée'));
    });

    it('keeps already-valid names unchanged', () => {
        expect(sanitizePlayerName('ChatGPT')).toBe('ChatGPT');
        expect(sanitizePlayerName('Bot42')).toBe('Bot42');
    });

    it('handles null/undefined input', () => {
        expect(sanitizePlayerName(undefined as any)).toBe('');
        expect(sanitizePlayerName(null as any)).toBe('');
    });
});

describe('validatePlayerName', () => {
    it('accepts letters and numbers in any script', () => {
        expect(validatePlayerName('ChatGPT')).toBeNull();
        expect(validatePlayerName('Bot42')).toBeNull();
        expect(validatePlayerName('Renée')).toBeNull();
        expect(validatePlayerName('Иван')).toBeNull();
        expect(validatePlayerName('太郎')).toBeNull();
        expect(validatePlayerName('Renée')).toBeNull();
    });

    it('rejects empty / whitespace-only names', () => {
        expect(validatePlayerName('')).toBe('Name cannot be empty');
        expect(validatePlayerName('   ')).toBe('Name cannot be empty');
    });

    it('rejects internal spaces and punctuation', () => {
        expect(validatePlayerName('Deep Seek')).toMatch(/letters and numbers/);
        expect(validatePlayerName('Bot_99')).toMatch(/letters and numbers/);
        expect(validatePlayerName("O'Brien")).toMatch(/letters and numbers/);
        expect(validatePlayerName('Jean-Luc')).toMatch(/letters and numbers/);
        expect(validatePlayerName('Иван Петров')).toMatch(/letters and numbers/);
    });

    it('treats surrounding whitespace as valid (trimmed before checking)', () => {
        // The trailing space that bricked a game is handled by sanitize/trim,
        // not flagged here — validation checks the trimmed value.
        expect(validatePlayerName('DeepSeekFlash ')).toBeNull();
        expect(validatePlayerName('  PLD  ')).toBeNull();
    });
});

describe('VALID_NAME_PATTERN', () => {
    it('matches the sanitize output for typical names', () => {
        expect(VALID_NAME_PATTERN.test(sanitizePlayerName('DeepSeekFlash '))).toBe(true);
        expect(VALID_NAME_PATTERN.test(sanitizePlayerName('Марія Олена'))).toBe(true);
    });
});
