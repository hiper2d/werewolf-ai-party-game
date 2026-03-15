export interface CreditPackage {
    id: string;
    amountUSD: number;
    label: string;
    stripePriceId: string;
}

export const CREDIT_PACKAGES: CreditPackage[] = [
    {
        id: 'small',
        amountUSD: 1,
        label: '$1.00',
        stripePriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_1 || '',
    },
    {
        id: 'medium-small',
        amountUSD: 3,
        label: '$3.00',
        stripePriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_3 || '',
    },
    {
        id: 'medium',
        amountUSD: 5,
        label: '$5.00',
        stripePriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_5 || '',
    },
    {
        id: 'large',
        amountUSD: 10,
        label: '$10.00',
        stripePriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_10 || '',
    },
];

/**
 * Markup applied to AI model costs for paid tier users.
 * Covers hosting and beer for devs.
 */
export const PAID_TIER_MARKUP = 0.15;
