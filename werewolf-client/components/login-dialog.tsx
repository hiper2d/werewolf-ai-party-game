'use client';

import { useEffect } from 'react';
import { signIn } from 'next-auth/react';
import { useLoginDialog } from '@/app/providers/LoginDialogProvider';
import CampfireSprite from '@/components/sprites/CampfireSprite';

export default function LoginDialog() {
  const { isOpen, callbackUrl, closeLoginDialog } = useLoginDialog();

  useEffect(() => {
    if (!isOpen) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeLoginDialog();
    };
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.body.style.overflow = originalOverflow;
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, closeLoginDialog]);

  if (!isOpen) return null;

  const accent = 'var(--ember-fire-3)';

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(5,5,10,0.78)',
        backdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={closeLoginDialog}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 400, maxWidth: '92vw',
          background: 'var(--ember-bg-2)',
          border: `2px solid ${accent}`,
          boxShadow: `0 0 0 2px var(--ember-bg-0), 0 0 0 4px ${accent}, 8px 8px 0 rgba(0,0,0,0.6)`,
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '12px 16px',
            background: 'var(--ember-bg-0)',
            borderBottom: `2px solid ${accent}`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}
        >
          <div className="pixel-text" style={{ fontSize: 11, color: accent, letterSpacing: 2 }}>
            ▸ ENTER THE CIRCLE
          </div>
          <button
            onClick={closeLoginDialog}
            className="pixel-text"
            style={{ fontSize: 12, color: 'var(--ember-ink-2)', cursor: 'pointer', background: 'none', border: 'none' }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 20 }}>
          {/* Campfire icon */}
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <div
              style={{
                width: 64, height: 64,
                margin: '0 auto 12px',
                background: 'var(--ember-bg-3)',
                border: '2px solid var(--ember-fire-3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <CampfireSprite scale={2} />
            </div>
            <div className="pixel-text" style={{ fontSize: 10, color: 'var(--ember-ink-0)' }}>
              SIGN IN
            </div>
            <div
              className="console-text"
              style={{ fontSize: 14, color: 'var(--ember-ink-2)', marginTop: 4 }}
            >
              A fire needs names to remember those who sat by it.
            </div>
          </div>

          {/* OAuth buttons */}
          <button
            onClick={() => signIn('github', { callbackUrl })}
            className="pbtn"
            style={{ width: '100%', justifyContent: 'center', marginBottom: 8 }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
            </svg>
            CONTINUE WITH GITHUB
          </button>

          <button
            onClick={() => signIn('google', { callbackUrl })}
            className="pbtn"
            style={{ width: '100%', justifyContent: 'center' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 001 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            CONTINUE WITH GOOGLE
          </button>
        </div>
      </div>
    </div>
  );
}
