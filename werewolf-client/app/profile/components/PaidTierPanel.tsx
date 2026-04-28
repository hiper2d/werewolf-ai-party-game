'use client';

import React, { useState } from 'react';
import { UserTier } from '@/app/api/game-models';
import { updateUserTier } from '@/app/api/user-actions';
import { createCheckoutSession } from '@/app/api/stripe-actions';
import { CREDIT_PACKAGES, PAID_TIER_MARKUP } from '@/app/config/credit-packages';
interface PaidTierPanelProps {
    userId: string;
    currentTier: UserTier;
    balance: number;
}

function formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(amount || 0);
}

export default function PaidTierPanel({ userId, currentTier, balance }: PaidTierPanelProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [buyingPackage, setBuyingPackage] = useState<string | null>(null);
    const isCurrentTier = currentTier === 'paid';
    const markupPercent = Math.round(PAID_TIER_MARKUP * 100);

    const handleSwitchTier = async () => {
        if (isLoading) return;
        setIsLoading(true);
        try {
            await updateUserTier(userId, 'paid');
            window.location.reload();
        } catch (error) {
            console.error('Failed to switch tier:', error);
            alert('Failed to switch tier. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

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
        <div className="space-y-6">
            <p className="text-[var(--fg-1)] text-sm">
                Add balance and play without managing API keys. Access all available AI models with no bot limits per game.
            </p>

            <div className="p-4 rounded-lg bg-[var(--accent-soft)] border border-[var(--accent-line)]">
                <p className="text-xs text-[var(--fg-1)]">
                    Each AI call costs the model&apos;s base price + {markupPercent}% (covers hosting and beer for devs).
                </p>
            </div>

            {!isCurrentTier && (
                <button
                    onClick={handleSwitchTier}
                    disabled={isLoading}
                    className="px-4 py-2 bg-[var(--accent)] hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed text-[var(--on-accent)] rounded-[var(--radius-md)] transition text-sm"
                >
                    {isLoading ? 'Switching...' : 'Switch to Paid Tier'}
                </button>
            )}

            {/* Balance Display */}
            <div>
                <h3 className="text-lg font-bold mb-2">Balance</h3>
                <p className="text-3xl font-bold text-[var(--gm-fg)]">
                    {formatCurrency(balance)}
                </p>
            </div>

            {/* Add Balance */}
            <div>
                <h3 className="text-lg font-bold mb-3">Add Balance</h3>
                <div className="flex gap-3 flex-wrap">
                    {CREDIT_PACKAGES.map((pkg) => (
                        <button
                            key={pkg.id}
                            onClick={() => handleBuyCredits(pkg.id)}
                            disabled={!!buyingPackage}
                            className="px-6 py-3 bg-[var(--accent)] hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed text-[var(--on-accent)] rounded-[var(--radius-md)]-lg transition font-semibold"
                        >
                            {buyingPackage === pkg.id ? 'Redirecting...' : pkg.label}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
