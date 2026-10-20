'use server'

import Stripe from 'stripe';
import { auth } from '@/auth';
import { CREDIT_PACKAGES } from '@/app/config/credit-packages';
import { getUser, setStripeCustomerId } from '@/app/api/user-actions';
import { logger } from '@/app/utils/logger';

function getStripe(): Stripe {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
        throw new Error('STRIPE_SECRET_KEY is not configured');
    }
    return new Stripe(key);
}

// Thrown server-action errors reach the browser as a bare digest in production, so the
// checkout start returns a result union the button can show as-is.
export type CheckoutSessionResult = { ok: true; url: string } | { ok: false; error: string };

export async function createCheckoutSession(packageId: string): Promise<CheckoutSessionResult> {
    const session = await auth();
    const userId = session?.user?.email;
    if (!userId) {
        return { ok: false, error: 'Please sign in again to buy credits.' };
    }
    const pkg = CREDIT_PACKAGES.find(p => p.id === packageId);
    if (!pkg || !pkg.stripePriceId) {
        logger.error('Stripe checkout: package missing or has no price id', { userId, packageId });
        await logger.flush();
        return { ok: false, error: 'This credit package is not available right now.' };
    }

    try {
        const stripe = getStripe();
        const user = await getUser(userId);

        // Get or create Stripe customer
        let customerId = user.stripeCustomerId;
        if (customerId) {
            // Verify the stored customer still exists in Stripe
            try {
                await stripe.customers.retrieve(customerId);
            } catch {
                // Customer was deleted or belongs to a different Stripe environment
                customerId = undefined;
            }
        }
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
        // The webhook processes only checkouts stamped as ours — the Stripe account
        // may host other apps' products. The PaymentIntent carries the same stamp so its
        // own events (declined attempts) can be told apart too.
        const metadata = {
            app: 'werewolf',
            userId,
            packageId: pkg.id,
            amountUSD: pkg.amountUSD.toString(),
        };

        const checkout = await stripe.checkout.sessions.create({
            customer: customerId,
            client_reference_id: userId,
            line_items: [
                {
                    price: pkg.stripePriceId,
                    quantity: 1,
                },
            ],
            mode: 'payment',
            // {CHECKOUT_SESSION_ID} is filled in by Stripe; the profile page reads the
            // session back to tell a paid checkout from one still processing.
            success_url: `${baseUrl}/profile?payment=success&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${baseUrl}/profile?payment=cancelled`,
            metadata,
            payment_intent_data: {
                description: `Werewolf credits $${pkg.amountUSD} (${userId})`,
                metadata,
            },
        });

        if (!checkout.url) {
            throw new Error('Stripe returned a checkout session without a URL');
        }
        logger.info('Stripe checkout started', { userId, packageId: pkg.id, amountUSD: pkg.amountUSD, checkoutSessionId: checkout.id });
        await logger.flush();
        return { ok: true, url: checkout.url };
    } catch (error: any) {
        logger.error('Stripe checkout: failed to create session', { userId, packageId, error: error?.message ?? String(error) });
        await logger.flush();
        return { ok: false, error: 'Could not start checkout. Please try again in a minute.' };
    }
}

export type CheckoutStatus =
    | { status: 'paid'; amountUSD: number }
    | { status: 'processing'; amountUSD: number }
    | { status: 'unknown' };

/** What the profile page says after Stripe sends the buyer back: credited, still waiting
 * for the bank (delayed payment methods), or unknown (not this user's session, Stripe down). */
export async function getCheckoutStatus(checkoutSessionId: string): Promise<CheckoutStatus> {
    const session = await auth();
    const userId = session?.user?.email;
    if (!userId || !checkoutSessionId.startsWith('cs_')) {
        return { status: 'unknown' };
    }
    try {
        const checkout = await getStripe().checkout.sessions.retrieve(checkoutSessionId);
        if (checkout.metadata?.userId !== userId) {
            return { status: 'unknown' };
        }
        const amountUSD = parseFloat(checkout.metadata?.amountUSD || '0');
        return checkout.payment_status === 'paid'
            ? { status: 'paid', amountUSD }
            : { status: 'processing', amountUSD };
    } catch (error: any) {
        logger.warn('Stripe checkout: could not read session status', { userId, checkoutSessionId, error: error?.message ?? String(error) });
        await logger.flush();
        return { status: 'unknown' };
    }
}
