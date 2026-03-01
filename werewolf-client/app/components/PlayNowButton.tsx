'use client';

import { useLoginDialog } from '@/app/providers/LoginDialogProvider';

export default function PlayNowButton() {
  const { openLoginDialog } = useLoginDialog();

  return (
    <button
      onClick={() => openLoginDialog('/games')}
      className="px-8 py-4 bg-btn text-btn-text rounded-lg font-bold text-xl hover:bg-btn-hover transition-all transform hover:scale-105 shadow-lg"
    >
      Play Now (Sign In)
    </button>
  );
}
