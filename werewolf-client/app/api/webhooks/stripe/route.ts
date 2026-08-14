import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { db } from '@/firebase/server';

function getStripe(): Stripe {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
        throw new Error('STRIPE_SECRET_KEY is not configured');
    }
    return new Stripe(key);
}

export async function POST(request: NextRequest) {
    const stripe = getStripe();
    const body = await request.text();
    const signature = request.headers.get('stripe-signature');

    if (!signature) {
        return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
    }

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
        console.error('STRIPE_WEBHOOK_SECRET is not configured');
        return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
    }

    let event: Stripe.Event;
    try {
        event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err: any) {
        console.error('Webhook signature verification failed:', err.message);
        return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object as Stripe.Checkout.Session;

        // Webhook endpoints receive account-wide events — process only checkouts stamped
        // as ours and acknowledge the rest unread (missing `app` counts as ours: sessions
        // created before this guard carry no app metadata).
        if ((session.metadata?.app ?? 'werewolf') !== 'werewolf') {
            return NextResponse.json({ received: true });
        }

        const userId = session.metadata?.userId;
        const amountUSD = parseFloat(session.metadata?.amountUSD || '0');

        if (!userId || amountUSD <= 0) {
            console.error('Invalid session metadata:', session.metadata);
            return NextResponse.json({ error: 'Invalid metadata' }, { status: 400 });
        }

        try {
            if (!db) {
                throw new Error('Firestore is not initialized');
            }
            // Credit exactly once per event: the idempotency claim, the balance credit
            // and the tier upgrade commit in ONE transaction. A get-then-set check
            // leaves a window where two concurrent deliveries of the same event (Stripe
            // retries, or two `stripe listen` forwarders in dev) both read "not
            // processed" and both credit.
            const eventRef = db.collection('stripe_events').doc(event.id);
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
                    processedAt: new Date().toISOString(),
                });
                credited = true;
            });

            console.log(credited
                ? `Added $${amountUSD} balance for user ${userId}`
                : `Stripe event ${event.id} already processed, skipping`);
        } catch (error) {
            console.error('Failed to add balance:', error);
            return NextResponse.json({ error: 'Failed to process payment' }, { status: 500 });
        }
    }

    return NextResponse.json({ received: true });
}
