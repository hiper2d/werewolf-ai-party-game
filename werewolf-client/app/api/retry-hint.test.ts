import {
    invalidJsonExplanation,
    invalidTargetExplanation,
    isResponseFormatFailure,
    repeatTargetExplanation,
    selfSelectionExplanation,
} from '@/app/api/retry-hint';

const LIVE = ['Selkie', 'Bram', 'Ines'];

describe('retry explanations', () => {
    describe('invalidTargetExplanation', () => {
        it('names what was chosen and lists every legal option', () => {
            const text = invalidTargetExplanation('Rook', LIVE);
            expect(text).toContain('"Rook"');
            expect(text).toContain('not one of the allowed options');
            for (const name of LIVE) expect(text).toContain(name);
        });
    });

    describe('selfSelectionExplanation', () => {
        it('states the actual rule rather than implying a typo', () => {
            const text = selfSelectionExplanation('vote for', LIVE);
            expect(text).toContain('You chose yourself');
            expect(text).toContain('not allowed to vote for yourself');
            // The generic wording would send the model looking for a misspelling.
            expect(text).not.toContain('may be misspelled');
        });

        it('takes the action verb so each role reads naturally', () => {
            expect(selfSelectionExplanation('abduct', LIVE)).toContain('abduct yourself');
            expect(selfSelectionExplanation('investigate', LIVE)).toContain('investigate yourself');
            expect(selfSelectionExplanation('eliminate', LIVE)).toContain('eliminate yourself');
        });
    });

    describe('repeatTargetExplanation', () => {
        it('explains the two-nights rule and does not call the name invalid', () => {
            const text = repeatTargetExplanation('Selkie', ['Bram', 'Ines']);
            expect(text).toContain('two nights in a row');
            expect(text).not.toContain('not one of the allowed options');
        });
    });

    describe('invalidJsonExplanation', () => {
        it('asks for bare JSON and offers no target list', () => {
            const text = invalidJsonExplanation();
            expect(text).toContain('not valid JSON');
            expect(text).toContain('ONLY the JSON');
            // The failure was the response format, not the choice — a list would mislead.
            expect(text).not.toContain('EXACTLY ONE name');
        });
    });

    describe('isResponseFormatFailure', () => {
        it.each([
            ['Failed to parse JSON response: Unexpected token', true],
            ['Response validation failed: target: Required', true],
            ['schema validation failed', true],
            ['overloaded_error: server busy', false],
            ['429 rate_limit', false],
            ['', false],
            [undefined, false],
        ])('%s -> %s', (details, expected) => {
            expect(isResponseFormatFailure(details as any)).toBe(expected);
        });
    });

    it('every explanation opens with the same rejection marker', () => {
        for (const text of [
            invalidTargetExplanation('Rook', LIVE),
            selfSelectionExplanation('vote for', LIVE),
            repeatTargetExplanation('Selkie', LIVE),
            invalidJsonExplanation(),
        ]) {
            expect(text.startsWith('**Your previous answer was rejected.**')).toBe(true);
        }
    });

    it('target-based explanations end with the copy-exactly list', () => {
        for (const text of [
            invalidTargetExplanation('Rook', LIVE),
            selfSelectionExplanation('vote for', LIVE),
            repeatTargetExplanation('Selkie', LIVE),
        ]) {
            expect(text).toContain('EXACTLY ONE');
            expect(text.endsWith(LIVE.join(', '))).toBe(true);
        }
    });
});
