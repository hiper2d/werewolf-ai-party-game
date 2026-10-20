import { resolveTargetName, normalizeTargetName } from './target-resolution';

const warn = jest.fn();
jest.mock('@/app/utils/logger', () => ({
    logger: { warn: (...args: unknown[]) => warn(...args), info: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const CAST = ['Zecora', 'Twilight', 'Adagio', 'Sonata', 'Ember', 'Blackjust'];

describe('resolveTargetName', () => {
    it('returns an exact match untouched', () => {
        expect(resolveTargetName('Twilight', CAST)).toBe('Twilight');
    });

    it('trims surrounding whitespace before matching', () => {
        expect(resolveTargetName('  Sonata \n', CAST)).toBe('Sonata');
    });

    it.each([
        // The four real Muse Spark 1.3 answers from everfree-forest-1792304417222 (2026-10-18/19).
        ['Twilight noexcept——correction Twilight strictly Twilight as target: Twilight', 'Twilight'],
        ['Sonatabitcoinbips.xyzNwcGvUEBbmCeIRbMbhfBRhucHLFiejRoqfLLhqWvIxbLvwqASffjx', 'Sonata'],
        ['Twilightaya', 'Twilight'],
        ['Sonatadocumentationfragment--REDACTED-TO-AVOID-CONFUSION-WITH-MARKDOWN--narrativeHint', 'Sonata'],
    ])('repairs a name that starts right and trails into garbage: %s', (raw, expected) => {
        expect(resolveTargetName(raw, CAST)).toBe(expected);
    });

    it('prefers the longest candidate when one name is a prefix of another', () => {
        expect(resolveTargetName('Annabel-garbage', ['Ann', 'Anna', 'Annabel', 'Bob'])).toBe('Annabel');
        expect(resolveTargetName('Annaxyz', ['Ann', 'Anna', 'Annabel', 'Bob'])).toBe('Anna');
    });

    it('does not resolve a name that merely appears later in the answer', () => {
        expect(resolveTargetName('I vote for Twilight', CAST)).toBeNull();
    });

    it('is case-sensitive, like the lists the model copies from', () => {
        expect(resolveTargetName('twilight', CAST)).toBeNull();
    });

    it('returns null for empty, missing or unrelated answers', () => {
        expect(resolveTargetName('', CAST)).toBeNull();
        expect(resolveTargetName('   ', CAST)).toBeNull();
        expect(resolveTargetName(undefined, CAST)).toBeNull();
        expect(resolveTargetName(null, CAST)).toBeNull();
        expect(resolveTargetName('Nobody', CAST)).toBeNull();
    });

    it('ignores empty candidate names', () => {
        expect(resolveTargetName('anything', ['', 'x'])).toBeNull();
    });
});

describe('normalizeTargetName', () => {
    const ctx = { gameId: 'g1', botName: 'Zecora', model: 'muse-spark', action: 'doctor' };

    beforeEach(() => warn.mockClear());

    it('returns the repaired name and logs one warn with a stable code', () => {
        expect(normalizeTargetName('Twilightaya', CAST, ctx)).toBe('Twilight');
        expect(warn).toHaveBeenCalledTimes(1);
        const [message, fields] = warn.mock.calls[0];
        expect(message).toContain('TARGET_RESOLVED_BY_PREFIX');
        expect(fields).toMatchObject({
            code: 'TARGET_RESOLVED_BY_PREFIX', gameId: 'g1', botName: 'Zecora', model: 'muse-spark',
            action: 'doctor', raw: 'Twilightaya', resolved: 'Twilight',
        });
    });

    it('returns the raw answer unchanged, without logging, when nothing resolves', () => {
        expect(normalizeTargetName('Nobody', CAST, ctx)).toBe('Nobody');
        expect(warn).not.toHaveBeenCalled();
    });

    it('does not log an exact match', () => {
        expect(normalizeTargetName('Ember', CAST, ctx)).toBe('Ember');
        expect(warn).not.toHaveBeenCalled();
    });
});
