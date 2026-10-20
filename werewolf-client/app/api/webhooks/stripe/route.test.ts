// The webhook credits money: only a PAID checkout may credit, once per checkout session,
// whichever of `completed` / `async_payment_succeeded` brings the paid state.

const constructEvent = jest.fn();
jest.mock('stripe', () => jest.fn().mockImplementation(() => ({ webhooks: { constructEvent } })));

const docs = new Map<string, any>();
const doc = (collection: string, id: string) => ({ path: `${collection}/${id}` });
jest.mock('@/firebase/server', () => ({
    db: {
        collection: (collection: string) => ({ doc: (id: string) => doc(collection, id) }),
        runTransaction: async (fn: (tx: any) => Promise<void>) => {
            const writes: [string, any][] = [];
            await fn({
                get: async (ref: { path: string }) => ({ exists: docs.has(ref.path), data: () => docs.get(ref.path) }),
                update: (ref: { path: string }, data: any) => writes.push([ref.path, { ...docs.get(ref.path), ...data }]),
                set: (ref: { path: string }, data: any) => writes.push([ref.path, data]),
            });
            writes.forEach(([path, data]) => docs.set(path, data));
        },
    },
}));

jest.mock('@/app/utils/logger', () => ({
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), flush: jest.fn() },
}));

import { NextRequest } from 'next/server';
import { POST } from './route';
import { logger } from '@/app/utils/logger';

const USER = 'buyer@example.com';

function checkoutEvent(type: string, paymentStatus: string, overrides: Record<string, any> = {}) {
    return {
        id: `evt_${Math.random().toString(36).slice(2)}`,
        type,
        data: {
            object: {
                id: 'cs_test_1',
                payment_status: paymentStatus,
                payment_intent: 'pi_test_1',
                metadata: { app: 'werewolf', userId: USER, amountUSD: '10', packageId: 'large' },
                ...overrides,
            },
        },
    };
}

async function deliver(event: any) {
    constructEvent.mockReturnValueOnce(event);
    const request = new NextRequest('http://localhost/api/webhooks/stripe', {
        method: 'POST',
        body: '{}',
        headers: { 'stripe-signature': 'sig' },
    });
    return POST(request);
}

const balance = () => docs.get(`users/${USER}`)?.balance;

beforeEach(() => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_x';
    docs.clear();
    docs.set(`users/${USER}`, { balance: 2, tier: 'free' });
    jest.clearAllMocks();
});

describe('stripe webhook', () => {
    it('credits a paid checkout and upgrades the tier', async () => {
        const res = await deliver(checkoutEvent('checkout.session.completed', 'paid'));
        expect(res.status).toBe(200);
        expect(balance()).toBe(12);
        expect(docs.get(`users/${USER}`).tier).toBe('paid');
        expect(docs.get('stripe_events/cs_test_1')).toMatchObject({ userId: USER, amountUSD: 10, paymentIntentId: 'pi_test_1' });
    });

    it('does not credit a completed but unpaid checkout (delayed payment method)', async () => {
        const res = await deliver(checkoutEvent('checkout.session.completed', 'unpaid'));
        expect(res.status).toBe(200);
        expect(balance()).toBe(2);
        expect(docs.has('stripe_events/cs_test_1')).toBe(false);
    });

    it('credits when the delayed payment succeeds, once', async () => {
        await deliver(checkoutEvent('checkout.session.completed', 'unpaid'));
        await deliver(checkoutEvent('checkout.session.async_payment_succeeded', 'paid'));
        await deliver(checkoutEvent('checkout.session.async_payment_succeeded', 'paid'));
        expect(balance()).toBe(12);
    });

    it('credits a session once even when two different events report it paid', async () => {
        await deliver(checkoutEvent('checkout.session.completed', 'paid'));
        await deliver(checkoutEvent('checkout.session.async_payment_succeeded', 'paid'));
        expect(balance()).toBe(12);
    });

    it('ignores checkouts stamped by another app', async () => {
        await deliver(checkoutEvent('checkout.session.completed', 'paid', { metadata: { app: 'other', userId: USER, amountUSD: '10' } }));
        expect(balance()).toBe(2);
    });

    it('logs failed delayed payments and expired checkouts without crediting', async () => {
        await deliver(checkoutEvent('checkout.session.async_payment_failed', 'unpaid'));
        await deliver(checkoutEvent('checkout.session.expired', 'unpaid'));
        expect(balance()).toBe(2);
        expect(logger.warn).toHaveBeenCalledWith('Stripe delayed payment failed, nothing credited', expect.objectContaining({ userId: USER }));
        expect(logger.info).toHaveBeenCalledWith('Stripe checkout expired unpaid', expect.objectContaining({ userId: USER }));
    });

    it('logs a declined attempt with the method, card country and decline code', async () => {
        await deliver({
            id: 'evt_pf',
            type: 'payment_intent.payment_failed',
            data: {
                object: {
                    id: 'pi_test_1',
                    metadata: { app: 'werewolf', userId: USER, amountUSD: '10' },
                    last_payment_error: {
                        code: 'card_declined',
                        decline_code: 'do_not_honor',
                        message: 'Your card was declined.',
                        payment_method: { type: 'card', card: { country: 'RU' } },
                    },
                },
            },
        });
        expect(logger.warn).toHaveBeenCalledWith('Stripe payment attempt declined', expect.objectContaining({
            userId: USER, paymentMethodType: 'card', cardCountry: 'RU', declineCode: 'do_not_honor',
        }));
    });

    it('rejects a bad signature', async () => {
        constructEvent.mockImplementationOnce(() => { throw new Error('bad sig'); });
        const request = new NextRequest('http://localhost/api/webhooks/stripe', {
            method: 'POST', body: '{}', headers: { 'stripe-signature': 'sig' },
        });
        const res = await POST(request);
        expect(res.status).toBe(400);
        expect(balance()).toBe(2);
    });
});
