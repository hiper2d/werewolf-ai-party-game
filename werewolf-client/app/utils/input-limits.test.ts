import { clampUserText, INPUT_LIMITS, MAX_STT_AUDIO_BYTES, MAX_STT_RECORDING_MS } from './input-limits';

describe('clampUserText', () => {
    it('trims surrounding whitespace', () => {
        expect(clampUserText('  a pirate ship  ', 100)).toBe('a pirate ship');
    });

    it('cuts text to the cap', () => {
        expect(clampUserText('x'.repeat(500), 100)).toHaveLength(100);
    });

    it('leaves text under the cap untouched', () => {
        expect(clampUserText('short', 100)).toBe('short');
    });

    it('keeps newlines — story fields are multi-line', () => {
        expect(clampUserText('line one\nline two', 100)).toBe('line one\nline two');
    });

    it('treats null and undefined as empty', () => {
        expect(clampUserText(undefined, 100)).toBe('');
        expect(clampUserText(null, 100)).toBe('');
    });

    it('trims before cutting, so leading spaces do not eat the budget', () => {
        expect(clampUserText('   abcdef', 3)).toBe('abc');
    });
});

describe('INPUT_LIMITS', () => {
    it('keeps the game title well inside the Firestore document id ceiling', () => {
        // createGame builds the id as `${sanitizedTheme}-${timestamp}`; ids are
        // capped at 1500 bytes.
        expect(INPUT_LIMITS.gameTitle).toBeLessThan(1400);
    });

    it('caps every field it declares at a positive length', () => {
        for (const [field, limit] of Object.entries(INPUT_LIMITS)) {
            expect(`${field}:${limit > 0}`).toBe(`${field}:true`);
        }
    });
});

describe('dictation limits', () => {
    it('allows enough audio for a full-length recording', () => {
        // WebM/Opus is roughly 16 KB/s; the byte cap must not cut off a clip the
        // recorder itself considers legal.
        const worstCaseBytes = (MAX_STT_RECORDING_MS / 1000) * 16 * 1024;
        expect(MAX_STT_AUDIO_BYTES).toBeGreaterThan(worstCaseBytes);
    });

    it('caps a dictation at roughly what a chat message can hold', () => {
        // ~150 words/min of speech at ~6 chars/word.
        const spokenChars = (MAX_STT_RECORDING_MS / 60_000) * 150 * 6;
        expect(spokenChars).toBeLessThanOrEqual(INPUT_LIMITS.chatMessage);
    });
});
