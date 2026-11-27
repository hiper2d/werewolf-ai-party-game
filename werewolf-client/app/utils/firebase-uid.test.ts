import {firebaseUidForEmail} from './firebase-uid';

describe('firebaseUidForEmail', () => {
    it('is stable, case-blind and does not contain the email', () => {
        const uid = firebaseUidForEmail('Player@Example.com ');
        expect(uid).toBe(firebaseUidForEmail('player@example.com'));
        expect(uid).toMatch(/^u_[0-9a-f]{40}$/);
        expect(uid).not.toContain('player');
    });
    it('differs between accounts', () => {
        expect(firebaseUidForEmail('a@example.com')).not.toBe(firebaseUidForEmail('b@example.com'));
    });
});
