import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { db } from '@/firebase/server';
import { logger } from '@/app/utils/logger';

function getStripe(): Stripe {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
        throw new Error('STRIPE_SECRET_KEY is not configured');
    }
    return new Stripe(key);
}

// Webhook endpoints receive account-wide events — process only objects stamped as ours
// and acknowledge the rest unread (missing `app` counts as ours: checkouts created before
// this guard carry no app metadata).
function isOurs(metadata: Stripe.Metadata | null | undefined): boolean {
    return (metadata?.app ?? 'werewolf') === 'werewolf';
}

async function respond(body: object, status = 200) {
    // Serverless: the batched Better Stack lines must leave before the function freezes.
    await logger.flush();
    return NextResponse.json(body, { status });
}

/**
 * Credits a paid checkout exactly once. The idempotency key is the checkout SESSION, not
 * the event: a delayed payment method sends `completed` (unpaid) and later
 * `async_payment_succeeded`, and only one of them may credit. The claim, the balance
 * credit and the tier upgrade commit in ONE transaction — a get-then-set check leaves a
 * window where two concurrent deliveries (Stripe retries, or two `stripe listen`
 * forwarders in dev) both read "not processed" and both credit.
 */
async function creditCheckout(event: Stripe.Event, session: Stripe.Checkout.Session): Promise<NextResponse> {
    const userId = session.metadata?.userId;
    const amountUSD = parseFloat(session.metadata?.amountUSD || '0');

    if (!userId || amountUSD <= 0) {
        logger.error('Stripe webhook: invalid checkout metadata', { eventId: event.id, checkoutSessionId: session.id, metadata: session.metadata });
        return respond({ error: 'Invalid metadata' }, 400);
    }

    try {
        if (!db) {
            throw new Error('Firestore is not initialized');
        }
        const eventRef = db.collection('stripe_events').doc(session.id);
        const userRef = db.collection('users').doc(userId);
        let credited = false;
        await db.runTransaction(async (transaction) => {
            credited = false;
            const [eventSnap, userSnap] = await Promise.all([
                transaction.get(eventRef),
                transaction.get(userRef),
            ]);
            if (eventSnap.exists) {
                return; // already processed — a retry or a duplicate delivery
            }
            if (!userSnap.exists) {
                throw new Error(`User ${userId} not found`);
            }
            const data = userSnap.data();
            const update: { balance: number; tier?: string } = {
                balance: parseFloat(((data?.balance || 0) + amountUSD).toFixed(6)),
            };
            // Adding funds is an explicit opt-in to paid usage (same rule as addBalance).
            if ((data?.tier || 'free') !== 'paid') {
                update.tier = 'paid';
            }
            transaction.update(userRef, update);
            transaction.set(eventRef, {
                userId,
                amountUSD,
                packageId: session.metadata?.packageId,
                eventId: event.id,
                eventType: event.type,
                checkoutSessionId: session.id,
                paymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null,
                processedAt: new Date().toISOString(),
            });
            credited = true;
        });

        if (credited) {
            logger.info('Stripe payment credited', { userId, amountUSD, eventId: event.id, eventType: event.type, checkoutSessionId: session.id });
        } else {
            logger.info('Stripe checkout already credited, skipping', { userId, eventId: event.id, checkoutSessionId: session.id });
        }
        return respond({ received: true });
    } catch (error: any) {
        // A 500 makes Stripe retry the delivery for up to three days.
        logger.error('Stripe webhook: failed to credit balance', { userId, amountUSD, eventId: event.id, checkoutSessionId: session.id, error: error?.message ?? String(error) });
        return respond({ error: 'Failed to process payment' }, 500);
    }
}

export async function POST(request: NextRequest) {
    const stripe = getStripe();
    const body = await request.text();
    const signature = request.headers.get('stripe-signature');

    if (!signature) {
        logger.warn('Stripe webhook: missing stripe-signature header');
        return respond({ error: 'Missing stripe-signature header' }, 400);
    }

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
        logger.error('Stripe webhook: STRIPE_WEBHOOK_SECRET is not configured');
        return respond({ error: 'Webhook secret not configured' }, 500);
    }

    let event: Stripe.Event;
    try {
        event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err: any) {
        logger.error('Stripe webhook: signature verification failed', { error: err?.message ?? String(err) });
        return respond({ error: 'Invalid signature' }, 400);
    }

    switch (event.type) {
        case 'checkout.session.completed':
        case 'checkout.session.async_payment_succeeded': {
            const session = event.data.object as Stripe.Checkout.Session;
            if (!isOurs(session.metadata)) break;
            // `completed` means the buyer finished the form, not that money moved: delayed
            // methods (bank debits, transfers) complete as `unpaid` and settle days later
            // through async_payment_succeeded / async_payment_failed.
            if (session.payment_status !== 'paid') {
                logger.info('Stripe checkout completed, payment pending', { userId: session.metadata?.userId, amountUSD: session.metadata?.amountUSD, paymentStatus: session.payment_status, checkoutSessionId: session.id });
                break;
            }
            return creditCheckout(event, session);
        }
        case 'checkout.session.async_payment_failed': {
            const session = event.data.object as Stripe.Checkout.Session;
            if (!isOurs(session.metadata)) break;
            logger.warn('Stripe delayed payment failed, nothing credited', { userId: session.metadata?.userId, amountUSD: session.metadata?.amountUSD, checkoutSessionId: session.id });
            break;
        }
        case 'checkout.session.expired': {
            // Abandoned checkout: the buyer left, or every payment attempt failed.
            const session = event.data.object as Stripe.Checkout.Session;
            if (!isOurs(session.metadata)) break;
            logger.info('Stripe checkout expired unpaid', { userId: session.metadata?.userId, amountUSD: session.metadata?.amountUSD, checkoutSessionId: session.id });
            break;
        }
        case 'payment_intent.payment_failed': {
            // One declined attempt inside a checkout (the buyer may still retry with another
            // method). Only PaymentIntents created since the checkout stamped them carry `app`;
            // older or foreign ones have no userId and are skipped.
            const intent = event.data.object as Stripe.PaymentIntent;
            if (intent.metadata?.app !== 'werewolf') break;
            const failure = intent.last_payment_error;
            logger.warn('Stripe payment attempt declined', {
                userId: intent.metadata.userId,
                amountUSD: intent.metadata.amountUSD,
                paymentIntentId: intent.id,
                paymentMethodType: failure?.payment_method?.type,
                cardCountry: failure?.payment_method?.card?.country,
                code: failure?.code,
                declineCode: failure?.decline_code,
                reason: failure?.message,
            });
            break;
        }
    }

    return respond({ received: true });
}
