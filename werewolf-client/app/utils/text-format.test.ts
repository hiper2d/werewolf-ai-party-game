import { formatReplyForDisplay, spaceEmDashes, unwrapQuotedReply } from './text-format';

describe('spaceEmDashes', () => {
    it('opens a closed em dash', () => {
        expect(spaceEmDashes("three—I'd say")).toBe("three — I'd say");
    });

    it('handles consecutive closed dashes', () => {
        expect(spaceEmDashes('a—b—c')).toBe('a — b — c');
    });

    it('completes a half-spaced dash without doubling spaces', () => {
        expect(spaceEmDashes('word— next')).toBe('word — next');
        expect(spaceEmDashes('word —next')).toBe('word — next');
    });

    it('leaves already-spaced dashes and other dashes alone', () => {
        expect(spaceEmDashes('word — next')).toBe('word — next');
        expect(spaceEmDashes('well-known 2020–2021')).toBe('well-known 2020–2021');
    });

    it('does not pad a dash at a line edge', () => {
        expect(spaceEmDashes('—I said')).toBe('— I said');
        expect(spaceEmDashes('trailing—')).toBe('trailing —');
        expect(spaceEmDashes('one—\ntwo')).toBe('one —\ntwo');
    });
});

describe('unwrapQuotedReply', () => {
    it('drops typographic quotes wrapping the whole reply', () => {
        expect(unwrapQuotedReply('“Max, welcome to Slytherin — believe me.”')).toBe('Max, welcome to Slytherin — believe me.');
    });

    it('drops straight quotes wrapping the whole reply, with surrounding whitespace', () => {
        expect(unwrapQuotedReply('  "Name your three suspects."\n')).toBe('Name your three suspects.');
    });

    it('keeps a reply that merely opens on dialogue', () => {
        const text = '"Trust me," she said. Then she left. "Go."';
        expect(unwrapQuotedReply(text)).toBe(text);
    });

    it('keeps mismatched or unpaired quotes', () => {
        expect(unwrapQuotedReply('"Unfinished thought')).toBe('"Unfinished thought');
        expect(unwrapQuotedReply("'mixed\"")).toBe("'mixed\"");
    });

    it('keeps apostrophes inside a single-quoted reply from counting as closers', () => {
        // The inner apostrophe belongs to the same family, so this is left as is
        // rather than risk cutting a contraction.
        const text = "'I'm not the one you want.'";
        expect(unwrapQuotedReply(text)).toBe(text);
    });

    it('ignores replies that are not quoted', () => {
        expect(unwrapQuotedReply('🗳️ Votes for Draco: "too quiet"')).toBe('🗳️ Votes for Draco: "too quiet"');
        expect(unwrapQuotedReply('')).toBe('');
    });
});

describe('formatReplyForDisplay', () => {
    it('unwraps and then spaces dashes', () => {
        expect(formatReplyForDisplay('“three—I’d say.”')).toBe('three — I’d say.');
    });
});
