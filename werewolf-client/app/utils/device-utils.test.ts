import { appendCapped } from './device-utils';

describe('appendCapped', () => {
    it('appends and dedupes to the end, newest last', () => {
        expect(appendCapped(['a', 'b'], 'c', 5)).toEqual(['a', 'b', 'c']);
        expect(appendCapped(['a', 'b'], 'a', 5)).toEqual(['b', 'a']);
    });

    it('keeps only the newest `cap` entries', () => {
        expect(appendCapped(['a', 'b', 'c'], 'd', 3)).toEqual(['b', 'c', 'd']);
    });

    it('survives a missing or malformed field', () => {
        expect(appendCapped(undefined, 'a', 3)).toEqual(['a']);
        expect(appendCapped('not-an-array', 'a', 3)).toEqual(['a']);
        expect(appendCapped([1, null, 'b'], 'a', 3)).toEqual(['b', 'a']);
    });
});
