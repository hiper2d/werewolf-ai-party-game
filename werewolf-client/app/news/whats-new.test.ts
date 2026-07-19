import {shouldShowWhatsNew} from './whats-new';

describe('shouldShowWhatsNew', () => {
    it('returns false on first visit (no stored id) — caller seeds instead', () => {
        expect(shouldShowWhatsNew(null, 'gpt-5-6')).toBe(false);
    });

    it('returns false when the latest entry has already been seen', () => {
        expect(shouldShowWhatsNew('gpt-5-6', 'gpt-5-6')).toBe(false);
    });

    it('returns true when a newer entry exists', () => {
        expect(shouldShowWhatsNew('sonnet-5', 'gpt-5-6')).toBe(true);
    });

    it('returns true when the stored id no longer exists in the changelog', () => {
        expect(shouldShowWhatsNew('removed-entry', 'gpt-5-6')).toBe(true);
    });

    it('returns false when the changelog is empty', () => {
        expect(shouldShowWhatsNew('gpt-5-6', undefined)).toBe(false);
    });
});
