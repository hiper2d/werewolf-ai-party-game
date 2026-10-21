'use client';

import React, { useState } from 'react';
import { createCheckoutSession } from '@/app/api/stripe-actions';
import { CREDIT_PACKAGES } from '@/app/config/credit-packages';

export default function BalanceTopUp() {
    const [buyingPackage, setBuyingPackage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleBuyCredits = async (packageId: string) => {
        if (buyingPackage) return;
        setBuyingPackage(packageId);
        setError(null);
        try {
            const result = await createCheckoutSession(packageId);
            if (result.ok) {
                window.location.assign(result.url);
                return;
            }
            setError(result.error);
        } catch (error: any) {
            console.error('Failed to create checkout session:', error);
            setError('Could not start checkout. Please try again in a minute.');
        }
        setBuyingPackage(null);
    };

    return (
        <div>
            <div className="flex gap-3 flex-wrap">
                {CREDIT_PACKAGES.map((pkg) => (
                    <button
                        key={pkg.id}
                        onClick={() => handleBuyCredits(pkg.id)}
                        disabled={!!buyingPackage}
                        className="inline-flex items-center justify-center font-semibold text-[15px] px-6 py-[13px] rounded-[var(--radius-md)] bg-[var(--accent)] text-[var(--accent-fg)] border border-transparent shadow-[var(--shadow-1)] hover:bg-[var(--accent-strong)] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-[120ms]"
                    >
                        {buyingPackage === pkg.id ? 'Redirecting…' : pkg.label}
                    </button>
                ))}
            </div>
            <p className="mt-3 text-[12.5px] text-[var(--fg-3)] leading-[1.45]">
                Cards, Link, Google Pay and crypto (USDC) are accepted at checkout. Cards issued in Russia
                are declined by the card networks — pay with crypto instead.
            </p>
            {error && (
                <p className="mt-3 text-[13px] text-[var(--warn-fg)]">{error}</p>
            )}
        </div>
    );
}
