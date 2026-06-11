'use client';

import { useLoginDialog } from '@/app/providers/LoginDialogProvider';

export default function PlayNowButton() {
  const { openLoginDialog } = useLoginDialog();

  return (
    <button
      onClick={() => openLoginDialog('/games')}
      className="inline-flex items-center justify-center font-semibold text-[15px] px-6 py-[13px] rounded-[var(--radius-md)] bg-[var(--accent)] text-[var(--accent-fg)] border border-transparent shadow-[var(--shadow-1)] hover:bg-[var(--accent-strong)] transition-all duration-[120ms]"
    >
      Play Now (Sign In)
    </button>
  );
}
