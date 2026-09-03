/**
 * Portrait sheets in storage: a draw stores its sheet beside the cards it
 * cut, every candidate records its framing, and a sheet is dropped only when
 * no character keeps a candidate from its round anymore.
 */

import { AvatarCandidate, DrawnSheet, MAX_AVATAR_CANDIDATES, writeCandidates } from './avatar-generation';
import { avatarSheetKey, avatarVariantKey, AvatarFraming } from '@/app/api/game-models';

const batchSet = jest.fn();
const batchCommit = jest.fn(async () => undefined);
jest.mock('@/firebase/server', () => ({
    db: {
        collection: jest.fn(),
        batch: jest.fn(() => ({ set: batchSet, commit: batchCommit })),
    },
}));
jest.mock('firebase-admin', () => ({ firestore: { FieldValue: { increment: jest.fn() }, FieldPath: jest.fn() } }));

/** A parent ref that records deletes by "collection/doc" path. */
function fakeParent(deleted: string[]) {
    return {
        collection: (col: string) => ({
            doc: (id: string) => ({ path: `${col}/${id}`, delete: async () => { deleted.push(`${col}/${id}`); } }),
        }),
    } as any;
}

const framing: AvatarFraming = { card: { left: 10, top: 0, width: 300, height: 400 }, circle: { x: 0.14, y: 0.03, d: 0.72 } };
const sheet: DrawnSheet = { jpeg: Buffer.from('sheet'), width: 2400, height: 1792, cells: [{ left: 0, top: 0, width: 600, height: 448 }], detected: true };
const candidates = (keys: string[]): AvatarCandidate[] => keys.map(key => ({ key, jpeg: Buffer.from(key), framing }));

function writtenPaths(): Map<string, any> {
    const out = new Map<string, any>();
    for (const [ref, data] of batchSet.mock.calls) out.set(ref.path, data);
    return out;
}

beforeEach(() => { batchSet.mockClear(); batchCommit.mockClear(); });

describe('writeCandidates with a sheet', () => {
    it('stores the sheet under the round and the framing on each candidate', async () => {
        const deleted: string[] = [];
        const { variants } = await writeCandidates(fakeParent(deleted), candidates(['Ann', 'Bob']), {}, [], { expireAt: 'ttl' }, sheet);

        const writes = writtenPaths();
        const stored = writes.get(`avatars/${avatarSheetKey(0)}`);
        expect(stored).toMatchObject({ width: 2400, height: 1792, detected: true, expireAt: 'ttl' });
        expect(stored.cells).toHaveLength(1);
        expect(writes.get(`avatarVariants/${avatarVariantKey('Ann', 0)}`)).toMatchObject({ sheet: 0, card: framing.card, circle: framing.circle });

        expect(variants.Ann).toEqual({ n: 1, sel: 0, framing: { '0': framing }, drawn: { '0': framing } });
        expect(deleted).toEqual([]);
    });

    it('appends a round under the next index and keeps earlier framings', async () => {
        const deleted: string[] = [];
        const existing = { Ann: { n: 1, sel: 0, framing: { '0': framing }, drawn: { '0': framing } } };
        const moved: AvatarFraming = { ...framing, card: { ...framing.card, left: 50 } };
        const { variants } = await writeCandidates(fakeParent(deleted), [{ key: 'Ann', jpeg: Buffer.from('x'), framing: moved }], existing, [], {}, sheet);

        expect(writtenPaths().has(`avatars/${avatarSheetKey(1)}`)).toBe(true);
        expect(variants.Ann.framing).toEqual({ '0': framing, '1': moved });
        expect(variants.Ann.sel).toBe(1);
        expect(deleted).toEqual([]);
    });

    it('drops a sheet together with the last candidates cut from it', async () => {
        const deleted: string[] = [];
        const full = { n: MAX_AVATAR_CANDIDATES, sel: MAX_AVATAR_CANDIDATES - 1, framing: { '0': framing }, drawn: { '0': framing } };
        const { variants } = await writeCandidates(fakeParent(deleted), candidates(['Ann', 'Bob']), { Ann: full, Bob: full }, [], {}, sheet);

        expect(deleted).toContain(`avatarVariants/${avatarVariantKey('Ann', 0)}`);
        expect(deleted).toContain(`avatars/${avatarSheetKey(0)}`);
        expect(deleted).not.toContain(`avatars/${avatarSheetKey(1)}`);
        expect(variants.Ann.first).toBe(1);
        expect(variants.Ann.framing?.['0']).toBeUndefined();
    });

    it('keeps a sheet while any character still keeps a candidate from its round', async () => {
        const deleted: string[] = [];
        const full = { n: MAX_AVATAR_CANDIDATES, sel: MAX_AVATAR_CANDIDATES - 1 };
        // Bob joined a round later: his window is behind Ann's.
        const { variants } = await writeCandidates(fakeParent(deleted), candidates(['Ann', 'Bob']), { Ann: full, Bob: { n: 1, sel: 0 } }, [], {}, sheet);

        expect(variants.Ann.first).toBe(1);
        expect(variants.Bob.first).toBeUndefined();
        expect(deleted).not.toContain(`avatars/${avatarSheetKey(0)}`);
    });

    it('preserves a custom mannequin framing across a redraw', async () => {
        const deleted: string[] = [];
        const { variants } = await writeCandidates(fakeParent(deleted), candidates(['Ann']), { Ann: { n: 1, sel: 0, mannequin: framing } }, [], {}, sheet);
        expect(variants.Ann.mannequin).toEqual(framing);
    });

    it('records nothing for legacy candidates without framing', async () => {
        const deleted: string[] = [];
        const { variants } = await writeCandidates(fakeParent(deleted), [{ key: 'Ann', jpeg: Buffer.from('x') }], {});
        expect(variants.Ann).toEqual({ n: 1, sel: 0 });
        expect(writtenPaths().has(`avatars/${avatarSheetKey(0)}`)).toBe(false);
    });
});
