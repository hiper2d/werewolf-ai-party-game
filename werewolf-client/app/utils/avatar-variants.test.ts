/**
 * Portrait candidate bookkeeping: how a character's drawn faces are stored,
 * counted, capped and cache-busted. Which face is shown is the player's call —
 * the newest draw by default, the arrows on the character card for the rest
 * (the preset mannequin included).
 */

import { appendWindow, MAX_AVATAR_CANDIDATES } from './avatar-generation';
import { avatarVariantKey, Game, MANNEQUIN_VARIANT_INDEX } from '@/app/api/game-models';
import { avatarVersion, getAvatarVariantState } from './avatar-utils';

jest.mock('@/firebase/server', () => ({ db: { collection: jest.fn() } }));
jest.mock('firebase-admin', () => ({ firestore: { FieldValue: { increment: jest.fn() } } }));

describe('appendWindow', () => {
    it('selects the newest draw and keeps everything under the cap', () => {
        expect(appendWindow({ n: 2 }, 1)).toEqual({ n: 3, sel: 2, first: 0, drop: { from: 0, to: 0 } });
    });

    it('drops the oldest candidate once the cap is exceeded', () => {
        expect(appendWindow({ n: MAX_AVATAR_CANDIDATES }, 1)).toEqual({ n: 4, sel: 3, first: 1, drop: { from: 0, to: 1 } });
    });

    it('advances an already-shifted window without re-dropping', () => {
        expect(appendWindow({ n: 4, first: 1 }, 1)).toEqual({ n: 5, sel: 4, first: 2, drop: { from: 1, to: 2 } });
    });

    it('starts a fresh character at candidate zero', () => {
        expect(appendWindow(undefined, 1)).toEqual({ n: 1, sel: 0, first: 0, drop: { from: 0, to: 0 } });
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
        avatarVariants: { Hank: { n: 3, sel: 2 }, Clay: { n: 5, sel: MANNEQUIN_VARIANT_INDEX, first: 2 } },
        avatarVersions: { Hank: 500 },
    } as unknown as Game;

    it('reports a character\'s candidate count and current choice', () => {
        expect(getAvatarVariantState(game, 'Hank')).toEqual({ key: 'Hank', count: 3, selected: 2, first: 0, hasCandidates: true });
    });

    it('counts only the candidates still inside the window', () => {
        expect(getAvatarVariantState(game, 'Clay')).toEqual({ key: 'Clay', count: 3, selected: MANNEQUIN_VARIANT_INDEX, first: 2, hasCandidates: true });
    });

    it('reports a pre-variants character as fixed', () => {
        expect(getAvatarVariantState(game, 'Sal')).toEqual({ key: 'Sal', count: 1, selected: 0, first: 0, hasCandidates: false });
    });

    it('busts the cache per key so one changed face does not reload the cast', () => {
        expect(avatarVersion(game, 'Hank')).toBe(500);
        expect(avatarVersion(game, 'Clay')).toBe(100);
    });
});
