/**
 * Illustration drafts (paid-tier sets drawn on the new-game preview): what the
 * server accepts from the page, when a draw appends vs. starts over, and when
 * createGame may adopt a draft into a game.
 */

import {
    findAdoptableDraft,
    getDraftState,
    normalizeDraftSpec,
    sameKeySet,
    startDraftGeneration,
} from './avatar-drafts';
import { AVATAR_DRAFT_IN_PROGRESS, AVATAR_GM_KEY, AvatarDraft } from '@/app/api/game-models';
import { STALE_REGEN_MS } from './avatar-generation';

// ---------------------------------------------------------------------------
// Firestore stand-in: one draft doc, read by get() / transaction get()
// ---------------------------------------------------------------------------

let draftDoc: Record<string, any> | null = null;
const setCalls: Record<string, any>[] = [];

const draftRef = {
    id: 'draft-id',
    get: jest.fn(async () => ({ exists: draftDoc !== null, data: () => draftDoc })),
    collection: jest.fn(),
};

jest.mock('@/firebase/server', () => ({
    db: {
        collection: jest.fn(() => ({ doc: jest.fn(() => draftRef) })),
        runTransaction: jest.fn(async (fn: any) => fn({
            get: async () => ({ exists: draftDoc !== null, data: () => draftDoc }),
            set: (_ref: any, data: any) => { setCalls.push(data); },
            update: jest.fn(),
        })),
    },
}));

jest.mock('firebase-admin', () => ({
    firestore: {
        Timestamp: { fromMillis: jest.fn((ms: number) => ({ __millis: ms })) },
        FieldValue: { increment: jest.fn((n: number) => ({ __inc: n })), delete: jest.fn(() => ({ __delete: true })) },
    },
}));

jest.mock('@/app/utils/tier-utils', () => ({ getUserTierAndApiKeys: jest.fn() }));
jest.mock('@/app/api/user-actions', () => ({ updateUserMonthlySpending: jest.fn(), deductBalance: jest.fn() }));
jest.mock('@/app/utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

const OWNER = 'owner@example.com';

const spec = () => ({
    theme: 'Dracula',
    description: 'A castle in the Carpathians.',
    humanPlayerName: 'Bob',
    bots: [
        { name: 'Mina', gender: 'female' as const, story: 'A schoolteacher with a secret.' },
        { name: 'Jonathan', gender: 'male' as const, story: 'A solicitor far from home.' },
    ],
});

const readyDraft = (overrides: Partial<AvatarDraft> = {}): AvatarDraft => ({
    ownerEmail: OWNER,
    status: 'ready',
    version: 1700000000000,
    keys: ['Mina', 'Jonathan', 'Bob', AVATAR_GM_KEY],
    avatarVariants: { Mina: { n: 2, sel: 1 }, Jonathan: { n: 2, sel: 0 }, Bob: { n: 2, sel: 0 }, [AVATAR_GM_KEY]: { n: 2, sel: 0 } },
    avatarVersions: {},
    hasScene: true,
    stages: { portraits: true, scene: true },
    generatingAt: null,
    totalCostUSD: 0.13,
    ...overrides,
});

beforeEach(() => {
    draftDoc = null;
    setCalls.length = 0;
});

describe('normalizeDraftSpec', () => {
    it('keys the cast the way the game will: sanitized bot + human names, then the GM', () => {
        const { keys, subject } = normalizeDraftSpec({ ...spec(), humanPlayerName: 'Bób Ω' });
        expect(keys).toEqual(['Mina', 'Jonathan', 'Bob', AVATAR_GM_KEY]);
        expect(subject.humanPlayerName).toBe('Bob');
    });

    it('rejects names that sanitize to nothing and duplicate names', () => {
        expect(() => normalizeDraftSpec({ ...spec(), humanPlayerName: '???' })).toThrow(/letter or number/);
        expect(() => normalizeDraftSpec({ ...spec(), bots: [{ name: 'Mina', gender: 'female', story: '' }, { name: 'Mína', gender: 'male', story: '' }] })).toThrow(/unique/);
    });

    it('rejects an empty theme or an empty cast', () => {
        expect(() => normalizeDraftSpec({ ...spec(), theme: '  ' })).toThrow(/theme/);
        expect(() => normalizeDraftSpec({ ...spec(), bots: [] })).toThrow(/player list/);
    });

    it('caps free text and coerces gender', () => {
        const { subject } = normalizeDraftSpec({ ...spec(), description: 'x'.repeat(5000), bots: [{ name: 'Al', gender: 'other' as any, story: 'y'.repeat(2000) }] });
        expect(subject.description).toHaveLength(4000);
        expect(subject.bots[0]).toEqual({ name: 'Al', gender: 'male', story: 'y'.repeat(1000) });
    });
});

describe('sameKeySet', () => {
    it('ignores order but not membership', () => {
        expect(sameKeySet(['a', 'b'], ['b', 'a'])).toBe(true);
        expect(sameKeySet(['a', 'b'], ['a', 'c'])).toBe(false);
        expect(sameKeySet(['a'], ['a', 'a'])).toBe(false);
    });
});

describe('startDraftGeneration', () => {
    const { subject, keys } = normalizeDraftSpec(spec());

    it('starts a fresh set when nothing was drawn', async () => {
        const claim = await startDraftGeneration(OWNER, subject, keys);
        expect(claim.claimed).toBe(true);
        expect(claim.append).toBe(false);
        expect(claim.state.status).toBe('generating');
        expect(setCalls[0]).toMatchObject({ ownerEmail: OWNER, status: 'generating', version: AVATAR_DRAFT_IN_PROGRESS, keys, avatarVariants: {} });
        expect(setCalls[0].expireAt).toBeDefined();
    });

    it('appends to a ready set drawn for the same cast, keeping its candidates and spend', async () => {
        draftDoc = readyDraft();
        const claim = await startDraftGeneration(OWNER, subject, keys);
        expect(claim.claimed).toBe(true);
        expect(claim.append).toBe(true);
        expect(claim.existingVariants.Mina).toEqual({ n: 2, sel: 1 });
        expect(setCalls[0]).toMatchObject({ version: 1700000000000, totalCostUSD: 0.13, hasScene: true });
    });

    it('starts over when the cast changed', async () => {
        draftDoc = readyDraft({ keys: ['Lucy', 'Bob', AVATAR_GM_KEY] });
        const claim = await startDraftGeneration(OWNER, subject, keys);
        expect(claim.append).toBe(false);
        expect(setCalls[0]).toMatchObject({ avatarVariants: {}, totalCostUSD: 0, hasScene: false });
    });

    it('does not claim while a draw is in flight — the double-click and the second tab', async () => {
        draftDoc = readyDraft({ status: 'generating', generatingAt: Date.now() - 10_000 });
        const claim = await startDraftGeneration(OWNER, subject, keys);
        expect(claim.claimed).toBe(false);
        expect(claim.state.status).toBe('generating');
        expect(setCalls).toHaveLength(0);
    });

    it('reclaims a draw that died past the stale window', async () => {
        draftDoc = readyDraft({ status: 'generating', generatingAt: Date.now() - STALE_REGEN_MS - 1 });
        const claim = await startDraftGeneration(OWNER, subject, keys);
        expect(claim.claimed).toBe(true);
    });
});

describe('getDraftState', () => {
    it('reports a stale in-flight draw as failed so the page stops waiting', async () => {
        draftDoc = readyDraft({ status: 'generating', generatingAt: Date.now() - STALE_REGEN_MS - 1 });
        const state = await getDraftState(OWNER);
        expect(state?.status).toBe('failed');
        expect(state?.error).toMatch(/timed out/);
    });

    it('never exposes owner or cost fields', async () => {
        draftDoc = readyDraft();
        const state = await getDraftState(OWNER);
        expect(state).not.toHaveProperty('ownerEmail');
        expect(state).not.toHaveProperty('totalCostUSD');
        expect(state?.version).toBe(1700000000000);
    });
});

describe('findAdoptableDraft', () => {
    const gameKeys = ['Mina', 'Jonathan', 'Bob', AVATAR_GM_KEY];

    it('adopts a ready draft whose version the client saw', async () => {
        draftDoc = readyDraft();
        const adoption = await findAdoptableDraft(OWNER, 1700000000000, gameKeys);
        expect(adoption?.mode).toBe('ready');
    });

    it('adopts a ready draft for a client that left while it was drawing', async () => {
        draftDoc = readyDraft();
        const adoption = await findAdoptableDraft(OWNER, AVATAR_DRAFT_IN_PROGRESS, gameKeys);
        expect(adoption?.mode).toBe('ready');
    });

    it('refuses a set redrawn in another tab (version mismatch)', async () => {
        draftDoc = readyDraft();
        expect(await findAdoptableDraft(OWNER, 1600000000000, gameKeys)).toBeNull();
    });

    it('refuses a set drawn for a different cast — a renamed character must not wear a stranger\'s face', async () => {
        draftDoc = readyDraft();
        expect(await findAdoptableDraft(OWNER, 1700000000000, ['Mina', 'Jon', 'Bob', AVATAR_GM_KEY])).toBeNull();
    });

    it('waits on a draw in flight, but not on one that died', async () => {
        draftDoc = readyDraft({ status: 'generating', generatingAt: Date.now() - 5_000 });
        expect((await findAdoptableDraft(OWNER, AVATAR_DRAFT_IN_PROGRESS, gameKeys))?.mode).toBe('in-progress');
        draftDoc = readyDraft({ status: 'generating', generatingAt: Date.now() - STALE_REGEN_MS - 1 });
        expect(await findAdoptableDraft(OWNER, AVATAR_DRAFT_IN_PROGRESS, gameKeys)).toBeNull();
    });

    it('ignores drafts when the client did not ask for one, and other users\' drafts', async () => {
        draftDoc = readyDraft();
        expect(await findAdoptableDraft(OWNER, undefined, gameKeys)).toBeNull();
        draftDoc = readyDraft({ ownerEmail: 'someone@else.com' });
        expect(await findAdoptableDraft(OWNER, 1700000000000, gameKeys)).toBeNull();
    });
});
