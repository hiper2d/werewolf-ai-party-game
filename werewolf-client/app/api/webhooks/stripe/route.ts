import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { addBalance } from '@/app/api/user-actions';
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

        // Idempotency: check if we've already processed this event
        if (db) {
            const eventRef = db.collection('stripe_events').doc(event.id);
            const eventDoc = await eventRef.get();
            if (eventDoc.exists) {
                console.log(`Stripe event ${event.id} already processed, skipping`);
                return NextResponse.json({ received: true });
            }
        }

        const userId = session.metadata?.userId;
        const amountUSD = parseFloat(session.metadata?.amountUSD || '0');

        if (!userId || amountUSD <= 0) {
            console.error('Invalid session metadata:', session.metadata);
            return NextResponse.json({ error: 'Invalid metadata' }, { status: 400 });
        }

        try {
            await addBalance(userId, amountUSD);

            // Record processed event for idempotency
            if (db) {
                await db.collection('stripe_events').doc(event.id).set({
                    userId,
                    amountUSD,
                    packageId: session.metadata?.packageId,
                    processedAt: new Date().toISOString(),
                });
            }

            console.log(`Added $${amountUSD} balance for user ${userId}`);
        } catch (error) {
            console.error('Failed to add balance:', error);
            return NextResponse.json({ error: 'Failed to process payment' }, { status: 500 });
        }
    }

    return NextResponse.json({ received: true });
}
