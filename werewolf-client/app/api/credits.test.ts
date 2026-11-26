/**
 * The credits server module against a small in-memory Firestore: who gets the sign-up
 * credit, the Discord claim's once-per-account and once-per-Discord-user rule, and the
 * guest spend that comes off.
 */
const store = new Map<string, Record<string, any>>();
const added: {collection: string; data: Record<string, any>}[] = [];

function applyWrite(current: Record<string, any> | undefined, data: Record<string, any>): Record<string, any> {
    const next: Record<string, any> = {...(current ?? {})};
    for (const [key, value] of Object.entries(data)) {
        if (value && typeof value === 'object' && Array.isArray((value as any).__union)) {
            const list: any[] = Array.isArray(next[key]) ? next[key] : [];
            next[key] = [...list, ...(value as any).__union.filter((v: any) => !list.includes(v))];
        } else {
            next[key] = value;
        }
    }
    return next;
}

function docRef(collection: string, id: string) {
    const path = `${collection}/${id}`;
    return {
        id,
        path,
        get: async () => ({id, exists: store.has(path), data: () => store.get(path)}),
        set: async (data: Record<string, any>, options?: {merge?: boolean}) => {
            store.set(path, options?.merge ? applyWrite(store.get(path), data) : applyWrite(undefined, data));
        },
        update: async (data: Record<string, any>) => {
            if (!store.has(path)) throw new Error(`no document ${path}`);
            store.set(path, applyWrite(store.get(path), data));
        },
        create: async (data: Record<string, any>) => {
            if (store.has(path)) throw new Error('already exists');
            store.set(path, {...data});
        },
    };
}

const fakeDb = {
    collection: (name: string) => ({
        doc: (id: string) => docRef(name, id),
        add: async (data: Record<string, any>) => { added.push({collection: name, data}); },
        where: (field: string, _op: string, value: any) => ({
            limit: () => ({
                get: async () => ({
                    docs: [...store.entries()]
                        .filter(([path, data]) => path.startsWith(`${name}/`) && data[field] === value)
                        .map(([path]) => ({id: path.slice(name.length + 1)})),
                }),
            }),
        }),
    }),
    getAll: async (...refs: any[]) => Promise.all(refs.map(ref => ref.get())),
    runTransaction: async (fn: any) => fn({
        get: (ref: any) => ref.get(),
        update: (ref: any, data: any) => ref.update(data),
        set: (ref: any, data: any, options?: any) => ref.set(data, options),
    }),
};

jest.mock('@/firebase/server', () => ({db: fakeDb}));
jest.mock('firebase-admin/firestore', () => ({
    FieldValue: {arrayUnion: (...values: any[]) => ({__union: values}), serverTimestamp: () => Date.now()},
}));
jest.mock('@/app/utils/logger', () => ({logger: {info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn()}}));
const requestDevice = {id: undefined as string | undefined};
jest.mock('@/app/api/device-actions', () => ({getRequestDeviceId: jest.fn(async () => requestDevice.id)}));
const limits = {creditsOn: 1, signupCreditUSD: 5, discordCreditUSD: 5};
jest.mock('@/app/api/limits-actions', () => ({getFreeTierLimits: jest.fn(async () => limits)}));

import {addCredits, chargeGuestSpend, claimDiscordCredit, ensureCredits, gatherCreditEvidence, getClaimCode} from './credits';

const DAY = 86_400_000;
const NOW = Date.now();
const GUEST = 'guest-11111111-2222-4333-8444-555555555555@guest.aiwerewolf.net';
const PC = {glRenderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11)', canvas: 'c1', screenW: 2560, screenH: 1440, timezone: 'America/Chicago'};
const MAC = {glRenderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M2)', canvas: 'c2', screenW: 1470, screenH: 956, timezone: 'America/New_York'};

const user = (email: string, data: Record<string, any>) => store.set(`users/${email}`, {email, tier: 'free', ...data});
const device = (id: string, users: string[], signals?: Record<string, any>, machineHash = 'm1') =>
    store.set(`devices/${id}`, {users, ...(signals ? {fingerprints: [{hash: `h-${id}`, machineHash, signals, seenAt: NOW}]} : {})});
const events = () => added.filter(row => row.collection === 'creditEvents').map(row => row.data);

beforeEach(() => {
    store.clear();
    added.length = 0;
    limits.creditsOn = 1;
    requestDevice.id = undefined;
});

describe('ensureCredits', () => {
    it('gives an account from before credits the sign-up amount, no questions', async () => {
        user('old@example.com', {created_at: NOW - 100 * DAY, lastDeviceId: 'd1'});
        user('other@example.com', {created_at: NOW - 200 * DAY});
        device('d1', ['other@example.com', 'old@example.com']);

        await expect(ensureCredits('old@example.com')).resolves.toBe(5);
        expect(store.get('users/old@example.com')).toMatchObject({credits: 5, signupCreditStatus: 'existing'});
        expect(events()).toEqual([expect.objectContaining({email: 'old@example.com', kind: 'existing', amountUSD: 5})]);
    });

    it('gives a new account on a browser nobody used the sign-up amount', async () => {
        user('new@example.com', {created_at: NOW, signupCreditStatus: 'pending', lastDeviceId: 'd1', lastIp: '1.2.3.4'});
        device('d1', ['new@example.com'], PC);

        await expect(ensureCredits('new@example.com')).resolves.toBe(5);
        expect(store.get('users/new@example.com')).toMatchObject({credits: 5, signupCreditStatus: 'granted'});
        expect(events()[0]).toMatchObject({kind: 'signup', amountUSD: 5});
    });

    it('denies a new account on a browser that already has an account', async () => {
        user('first@example.com', {created_at: NOW - 3 * DAY, credits: 0});
        user('second@example.com', {created_at: NOW, signupCreditStatus: 'pending', lastDeviceId: 'd1'});
        device('d1', ['first@example.com', 'second@example.com', GUEST], PC);

        await expect(ensureCredits('second@example.com')).resolves.toBe(0);
        expect(store.get('users/second@example.com')).toMatchObject({
            credits: 0, signupCreditStatus: 'denied',
            signupCreditInfo: expect.objectContaining({rules: ['device'], linked: ['first@example.com']}),
        });
        expect(events()[0]).toMatchObject({kind: 'signup_denied', amountUSD: 0, linked: ['first@example.com'], deviceId: 'd1'});
    });

    it("uses the request's device cookie when the account has no browser stamped yet", async () => {
        user('first@example.com', {created_at: NOW - 3 * DAY});
        user('second@example.com', {created_at: NOW, signupCreditStatus: 'pending'});
        device('d1', ['first@example.com'], PC);
        requestDevice.id = 'd1';

        await expect(ensureCredits('second@example.com')).resolves.toBe(0);
        expect(store.get('users/second@example.com')!.signupCreditInfo.rules).toEqual(['device']);
    });

    it('denies a fresh browser id on the same specific machine (cleared browser on a VPN)', async () => {
        user('first@example.com', {created_at: NOW - DAY});
        user('second@example.com', {created_at: NOW, signupCreditStatus: 'pending', lastDeviceId: 'd2', lastIp: '9.9.9.9'});
        device('d1', ['first@example.com'], PC);
        device('d2', ['second@example.com'], PC);
        store.set('fingerprints/m1', {devices: [{deviceId: 'd1', at: NOW - 2 * 3_600_000}, {deviceId: 'd2', at: NOW}]});

        await expect(ensureCredits('second@example.com')).resolves.toBe(0);
        expect(store.get('users/second@example.com')!.signupCreditInfo.rules).toEqual(['machine']);
    });

    it('grants and flags the same on a machine many people share (two MacBooks of one model)', async () => {
        user('first@example.com', {created_at: NOW - DAY});
        user('second@example.com', {created_at: NOW, signupCreditStatus: 'pending', lastDeviceId: 'd2', lastIp: '9.9.9.9'});
        device('d1', ['first@example.com'], MAC, 'm2');
        device('d2', ['second@example.com'], MAC, 'm2');
        store.set('fingerprints/m2', {devices: [{deviceId: 'd1', at: NOW - 3_600_000}, {deviceId: 'd2', at: NOW}]});

        await expect(ensureCredits('second@example.com')).resolves.toBe(5);
        expect(store.get('users/second@example.com')).toMatchObject({credits: 5, signupCreditStatus: 'flagged'});
        expect(events()[0]).toMatchObject({kind: 'signup_flagged', rules: ['machine'], linked: ['first@example.com']});
    });

    it('denies that same shared machine once the IP matches too', async () => {
        user('first@example.com', {created_at: NOW - DAY});
        user('second@example.com', {created_at: NOW, signupCreditStatus: 'pending', lastDeviceId: 'd2', lastIp: '9.9.9.9'});
        device('d1', ['first@example.com'], MAC, 'm2');
        device('d2', ['second@example.com'], MAC, 'm2');
        store.set('fingerprints/m2', {devices: [{deviceId: 'd1', at: NOW - 20 * DAY}]});
        store.set('ips/9.9.9.9', {devices: [{deviceId: 'd1', at: NOW - DAY}]});

        await expect(ensureCredits('second@example.com')).resolves.toBe(0);
        expect(store.get('users/second@example.com')!.signupCreditInfo.rules).toEqual(['machine+ip']);
    });

    it('ignores an IP sighting older than a week, and an account that came later', async () => {
        user('later@example.com', {created_at: NOW + DAY});
        user('old@example.com', {created_at: NOW - 60 * DAY});
        user('new@example.com', {created_at: NOW, signupCreditStatus: 'pending', lastDeviceId: 'd2', lastIp: '9.9.9.9'});
        device('d1', ['old@example.com']);
        device('d2', ['new@example.com', 'later@example.com']);
        store.set('ips/9.9.9.9', {devices: [{deviceId: 'd1', at: NOW - 8 * DAY}]});

        const evidence = await gatherCreditEvidence('new@example.com', store.get('users/new@example.com')!, NOW);
        expect(evidence).toMatchObject({sameDevice: [], sameMachine: [], sameIp: [], siblings: []});
    });

    it('finds a numbered sibling name created in the last month', async () => {
        user('reqaccv4@gmail.com', {created_at: NOW - 2 * DAY, handleStem: 'reqaccv'});
        user('reqaccv1@gmail.com', {created_at: NOW - 90 * DAY, handleStem: 'reqaccv'});
        user('reqaccv5@gmail.com', {created_at: NOW, signupCreditStatus: 'pending'});

        const evidence = await gatherCreditEvidence('reqaccv5@gmail.com', store.get('users/reqaccv5@gmail.com')!, NOW);
        expect(evidence.siblings).toEqual(['reqaccv4@gmail.com']);
    });

    it('takes the trial spend of a guest the account took over off the amount', async () => {
        user(GUEST, {guest: true, spendings: [{period: '2026-11', amountUSD: 0.4, freeAmountUSD: 0.4}]});
        user('new@example.com', {created_at: NOW, signupCreditStatus: 'pending', claimedGuests: [GUEST]});

        await expect(ensureCredits('new@example.com')).resolves.toBe(4.6);
        expect(store.get('users/new@example.com')!.guestSpendCharged).toEqual([GUEST]);
    });

    it('decides once: a second call returns what is there and writes no second row', async () => {
        user('new@example.com', {created_at: NOW, signupCreditStatus: 'pending'});
        await ensureCredits('new@example.com');
        store.get('users/new@example.com')!.credits = 1.25;
        await expect(ensureCredits('new@example.com')).resolves.toBe(1.25);
        expect(events()).toHaveLength(1);
    });

    it('gives a guest, a missing account and a switched-off system nothing', async () => {
        user(GUEST, {guest: true});
        await expect(ensureCredits(GUEST)).resolves.toBeUndefined();
        await expect(ensureCredits('nobody@example.com')).resolves.toBeUndefined();
        limits.creditsOn = 0;
        user('new@example.com', {created_at: NOW, signupCreditStatus: 'pending'});
        await expect(ensureCredits('new@example.com')).resolves.toBeUndefined();
        expect(store.get('users/new@example.com')).not.toHaveProperty('credits');
    });
});

describe('the Discord claim', () => {
    const claim = (code: unknown, discordUserId = '111111111111') => claimDiscordCredit({code, discordUserId, discordUsername: 'wolfie'});

    it('adds the amount once per account and once per Discord user', async () => {
        user('a@example.com', {created_at: NOW - 100 * DAY, credits: 0.5});
        user('b@example.com', {created_at: NOW - 100 * DAY, credits: 0});
        const codeA = await getClaimCode('a@example.com');
        const codeB = await getClaimCode('b@example.com');
        expect(await getClaimCode('a@example.com')).toBe(codeA);
        expect(codeA).not.toBe(codeB);

        await expect(claim(codeA.toLowerCase())).resolves.toEqual({ok: true, amountUSD: 5, credits: 5.5});
        expect(store.get('users/a@example.com')).toMatchObject({credits: 5.5, discordCredit: expect.objectContaining({discordUserId: '111111111111'})});
        expect(events()).toEqual([expect.objectContaining({kind: 'discord', email: 'a@example.com', discordUsername: 'wolfie'})]);

        // the same account again, from another Discord user
        await expect(claim(codeA, '222222222222')).resolves.toEqual({ok: false, reason: 'account_claimed'});
        // the same Discord user for another account
        await expect(claim(codeB)).resolves.toEqual({ok: false, reason: 'discord_claimed'});
        expect(store.get('users/b@example.com')!.credits).toBe(0);
        // another Discord user for that other account is fine
        await expect(claim(codeB, '222222222222')).resolves.toEqual({ok: true, amountUSD: 5, credits: 5});
    });

    it('refuses a code that is not one, an unknown code and a switched-off claim', async () => {
        await expect(claim('hello')).resolves.toEqual({ok: false, reason: 'bad_code'});
        await expect(claim('WOLF-ABCDEFGH')).resolves.toEqual({ok: false, reason: 'bad_code'});
        await expect(claimDiscordCredit({code: 'WOLF-ABCDEFGH', discordUserId: 'users/x'})).resolves.toEqual({ok: false, reason: 'bad_code'});
        limits.creditsOn = 0;
        await expect(claim('WOLF-ABCDEFGH')).resolves.toEqual({ok: false, reason: 'off'});
    });

    it('decides the sign-up credit before adding, so a claim never stands in for it', async () => {
        user('a@example.com', {created_at: NOW - 100 * DAY});
        const code = await getClaimCode('a@example.com');
        await expect(claim(code)).resolves.toEqual({ok: true, amountUSD: 5, credits: 10});
    });
});

describe('addCredits and chargeGuestSpend', () => {
    it('adds and takes away by hand, never below zero', async () => {
        user('a@example.com', {created_at: NOW - 100 * DAY, credits: 1});
        await expect(addCredits('a@example.com', 2.5, 'admin', {note: 'apology'})).resolves.toBe(3.5);
        await expect(addCredits('a@example.com', -10, 'admin')).resolves.toBe(0);
        expect(events().map(e => e.amountUSD)).toEqual([2.5, -10]);
        await expect(addCredits(GUEST, 1, 'admin')).rejects.toThrow(/guest/i);
    });

    it('takes a taken-over guest off decided credits once', async () => {
        user(GUEST, {guest: true, spendings: [{period: '2026-11', amountUSD: 0.3, freeAmountUSD: 0.3}]});
        user('a@example.com', {credits: 5});
        await chargeGuestSpend('a@example.com', GUEST);
        await chargeGuestSpend('a@example.com', GUEST);
        expect(store.get('users/a@example.com')).toMatchObject({credits: 4.7, guestSpendCharged: [GUEST]});

        // an account not decided yet is left for ensureCredits
        user('b@example.com', {});
        await chargeGuestSpend('b@example.com', GUEST);
        expect(store.get('users/b@example.com')).not.toHaveProperty('credits');
    });
});
