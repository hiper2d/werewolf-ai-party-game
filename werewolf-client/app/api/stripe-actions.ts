'use server'

import Stripe from 'stripe';
import { CREDIT_PACKAGES } from '@/app/config/credit-packages';
import { getUser, setStripeCustomerId } from '@/app/api/user-actions';

function getStripe(): Stripe {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
        throw new Error('STRIPE_SECRET_KEY is not configured');
    }
    return new Stripe(key);
}

export async function createCheckoutSession(
    userId: string,
    packageId: string
): Promise<string> {
    const stripe = getStripe();
    const pkg = CREDIT_PACKAGES.find(p => p.id === packageId);
    if (!pkg) {
        throw new Error(`Invalid package: ${packageId}`);
    }
    if (!pkg.stripePriceId) {
        throw new Error(`Stripe price ID not configured for package: ${packageId}`);
    }

    const user = await getUser(userId);

    // Get or create Stripe customer
    let customerId = user.stripeCustomerId;
    if (!customerId) {
        const customer = await stripe.customers.create({
            email: userId,
            name: user.name,
            metadata: { userId },
        });
        customerId = customer.id;
        await setStripeCustomerId(userId, customerId);
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

    const session = await stripe.checkout.sessions.create({
        customer: customerId,
        line_items: [
            {
                price: pkg.stripePriceId,
                quantity: 1,
            },
        ],
        mode: 'payment',
        success_url: `${baseUrl}/profile?tab=paid&payment=success`,
        cancel_url: `${baseUrl}/profile?tab=paid&payment=cancelled`,
        metadata: {
            userId,
            packageId: pkg.id,
            amountUSD: pkg.amountUSD.toString(),
        },
    });

    if (!session.url) {
        throw new Error('Failed to create checkout session');
    }

    return session.url;
}
