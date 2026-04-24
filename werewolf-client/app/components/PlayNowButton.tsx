'use client';

import { useLoginDialog } from '@/app/providers/LoginDialogProvider';

export default function PlayNowButton() {
  const { openLoginDialog } = useLoginDialog();

  return (
    <button
      onClick={() => openLoginDialog('/games')}
      className="pbtn pbtn-primary"
      style={{ fontSize: 12, padding: '14px 28px' }}
    >
      ▸ PLAY NOW
    </button>
  );
}
