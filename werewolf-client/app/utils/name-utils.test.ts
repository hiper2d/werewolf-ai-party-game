import { sanitizePlayerName, validatePlayerName, VALID_NAME_PATTERN } from './name-utils';

describe('sanitizePlayerName', () => {
    it('strips trailing/leading whitespace', () => {
        expect(sanitizePlayerName('DeepSeekFlash ')).toBe('DeepSeekFlash');
        expect(sanitizePlayerName('  PLD  ')).toBe('PLD');
    });

    it('removes internal spaces and punctuation', () => {
        expect(sanitizePlayerName('Deep Seek Flash')).toBe('DeepSeekFlash');
        expect(sanitizePlayerName('Bot-99!')).toBe('Bot99');
    });

    it('transliterates accented characters to ASCII', () => {
        expect(sanitizePlayerName('Renée')).toBe('Renee');
        expect(sanitizePlayerName('Jürgen')).toBe('Jurgen');
    });

    it('drops non-Latin characters entirely', () => {
        expect(sanitizePlayerName('日本語')).toBe('');
        expect(sanitizePlayerName('Игрок7')).toBe('7');
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
    it('accepts letters and numbers', () => {
        expect(validatePlayerName('ChatGPT')).toBeNull();
        expect(validatePlayerName('Bot42')).toBeNull();
    });

    it('rejects empty / whitespace-only names', () => {
        expect(validatePlayerName('')).toBe('Name cannot be empty');
        expect(validatePlayerName('   ')).toBe('Name cannot be empty');
    });

    it('rejects internal spaces and non-alphanumeric characters', () => {
        expect(validatePlayerName('Deep Seek')).toMatch(/letters and numbers/);
        expect(validatePlayerName('Renée')).toMatch(/letters and numbers/);
        expect(validatePlayerName('Bot_99')).toMatch(/letters and numbers/);
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
    });
});
