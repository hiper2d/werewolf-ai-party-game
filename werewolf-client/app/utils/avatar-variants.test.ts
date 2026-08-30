/**
 * Portrait candidate selection: which of a character's drawn faces is shown,
 * and when a bad round is worth redrawing at all.
 *
 * These two decisions are what replaced the old whole-set gate that discarded
 * twelve good portraits over one flagged cell
 * (docs/avatar-slice-verification-failures.md).
 */

import { chooseSelected, isSystemicFailure, SliceVerdict } from './avatar-generation';
import { avatarVariantKey, Game } from '@/app/api/game-models';
import { avatarVersion, getAvatarVariantState } from './avatar-utils';

jest.mock('@/firebase/server', () => ({ db: { collection: jest.fn() } }));
jest.mock('firebase-admin', () => ({ firestore: { FieldValue: { increment: jest.fn() } } }));

const clean = (): SliceVerdict => ({ hasText: false, genderMismatch: false });
const withText = (label: string): SliceVerdict => ({ hasText: true, genderMismatch: false, problem: `${label}: rendered text` });
const wrongGender = (label: string): SliceVerdict => ({ hasText: false, genderMismatch: true, problem: `${label}: expected male, saw female` });

describe('chooseSelected', () => {
    it('shows the first portrait the verifier had no complaint about', () => {
        expect(chooseSelected([{ flagged: true }, { flagged: false }, { flagged: false }])).toBe(1);
    });

    it('falls back to the first draw when every candidate is flagged', () => {
        expect(chooseSelected([{ flagged: true }, { flagged: true }])).toBe(0);
    });

    it('keeps the first candidate when it is already clean', () => {
        expect(chooseSelected([{ flagged: false }, { flagged: false }])).toBe(0);
    });
});

describe('isSystemicFailure', () => {
    it('does not redraw for a few lettered cells — the rest of the grid is fine', () => {
        // The wild-west shape: a sheriff badge and a saloon sign in a cast of 13.
        const verdicts = [withText('Hank'), withText('Clay'), ...Array(11).fill(clean())];
        expect(isSystemicFailure(verdicts)).toBe(false);
    });

    it('redraws when most cells carry text — the model drew a labeled card layout', () => {
        expect(isSystemicFailure(Array(13).fill(withText('x')))).toBe(true);
    });

    it('redraws on multiple gender mismatches — the grid drifted', () => {
        const verdicts = [wrongGender('Misato'), wrongGender('Maya'), ...Array(11).fill(clean())];
        expect(isSystemicFailure(verdicts)).toBe(true);
    });

    it('tolerates a single gender mismatch — stylized faces read ambiguously', () => {
        const verdicts = [wrongGender('Maya'), ...Array(12).fill(clean())];
        expect(isSystemicFailure(verdicts)).toBe(false);
    });

    it('accepts a clean round', () => {
        expect(isSystemicFailure(Array(13).fill(clean()))).toBe(false);
    });
});

describe('variant addressing', () => {
    it('namespaces candidates by key and index', () => {
        expect(avatarVariantKey('Hank', 2)).toBe('Hank__2');
    });

    const game = {
        id: 'western-1',
        avatarsStatus: 'ready',
        avatarsVersion: 100,
        avatarVariants: { Hank: { n: 3, sel: 2 } },
        avatarVersions: { Hank: 500 },
    } as unknown as Game;

    it('reports a character\'s candidate count and current choice', () => {
        expect(getAvatarVariantState(game, 'Hank')).toEqual({ key: 'Hank', count: 3, selected: 2 });
    });

    it('treats a character with no candidate record as having exactly one', () => {
        expect(getAvatarVariantState(game, 'Clay')).toEqual({ key: 'Clay', count: 1, selected: 0 });
    });

    it('busts the cache per key so one changed face does not reload the cast', () => {
        expect(avatarVersion(game, 'Hank')).toBe(500);
        expect(avatarVersion(game, 'Clay')).toBe(100);
    });
});
