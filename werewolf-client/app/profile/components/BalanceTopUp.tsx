'use client';

import React, { useState } from 'react';
import { createCheckoutSession } from '@/app/api/stripe-actions';
import { CREDIT_PACKAGES } from '@/app/config/credit-packages';

export default function BalanceTopUp({ userId }: { userId: string }) {
    const [buyingPackage, setBuyingPackage] = useState<string | null>(null);

    const handleBuyCredits = async (packageId: string) => {
        if (buyingPackage) return;
        setBuyingPackage(packageId);
        try {
            const checkoutUrl = await createCheckoutSession(userId, packageId);
            window.location.href = checkoutUrl;
        } catch (error: any) {
            console.error('Failed to create checkout session:', error);
            alert(`Failed to start checkout: ${error.message}`);
            setBuyingPackage(null);
        }
    };

    return (
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
    );
}
