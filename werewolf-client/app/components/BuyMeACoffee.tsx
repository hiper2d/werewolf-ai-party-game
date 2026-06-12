'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { usePathname } from 'next/navigation';
import { useLoginDialog } from '@/app/providers/LoginDialogProvider';
import { createCheckoutSession } from '@/app/api/stripe-actions';
import { CREDIT_PACKAGES } from '@/app/config/credit-packages';

// Fixed $5 "coffee" — no amount picker.
const COFFEE_PACKAGE = CREDIT_PACKAGES.find((p) => p.amountUSD === 5) ?? CREDIT_PACKAGES[0];

function CoffeeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M4 8h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8Z" />
      <path d="M17 9h2.5a2.5 2.5 0 0 1 0 5H17" />
      <path d="M8 2.5c-.5.8-.5 1.7 0 2.5M12 2.5c-.5.8-.5 1.7 0 2.5" />
    </svg>
  );
}

export default function BuyMeACoffee({ className = '', label = 'Buy me a coffee' }: { className?: string; label?: string }) {
  const { data: session } = useSession();
  const { openLoginDialog } = useLoginDialog();
  const pathname = usePathname();
  const [buying, setBuying] = useState(false);

  const email = session?.user?.email ?? null;

  const handleBuy = async () => {
    if (buying) return;
    // The checkout reuses the paid-tier flow, which needs a signed-in user.
    if (!email) {
      openLoginDialog(pathname || '/');
      return;
    }
    setBuying(true);
    try {
      const url = await createCheckoutSession(email, COFFEE_PACKAGE.id);
      window.location.href = url;
    } catch (error) {
      console.error('Failed to start coffee checkout:', error);
      setBuying(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleBuy}
      disabled={buying}
      title="Support the project — $5 via Stripe"
      className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-full border border-[var(--line-2)] bg-[var(--bg-1)] text-[13px] font-medium text-[var(--fg-1)] transition-all duration-[120ms] hover:border-[var(--accent-line)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent-text)] disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
    >
      <CoffeeIcon className="w-4 h-4" />
      {buying ? 'Redirecting…' : `${label} · $5`}
    </button>
  );
}
