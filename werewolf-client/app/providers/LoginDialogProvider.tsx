'use client';

import { createContext, useContext, useState, useCallback, useEffect, ReactNode, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

interface LoginDialogContextType {
  isOpen: boolean;
  callbackUrl: string;
  openLoginDialog: (callbackUrl?: string) => void;
  closeLoginDialog: () => void;
}

const LoginDialogContext = createContext<LoginDialogContextType | undefined>(undefined);

function LoginDialogUrlSync({ onOpen }: { onOpen: (callbackUrl?: string) => void }) {
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get('login') === 'true') {
      const cb = searchParams.get('callbackUrl') || undefined;
      onOpen(cb);
      // Clean URL without triggering a re-render
      window.history.replaceState({}, '', '/');
    }
  }, [searchParams, onOpen]);

  return null;
}

export function LoginDialogProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [callbackUrl, setCallbackUrl] = useState('/games');

  const openLoginDialog = useCallback((url?: string) => {
    setCallbackUrl(url || '/games');
    setIsOpen(true);
  }, []);

  const closeLoginDialog = useCallback(() => {
    setIsOpen(false);
  }, []);

  return (
    <LoginDialogContext.Provider value={{ isOpen, callbackUrl, openLoginDialog, closeLoginDialog }}>
      <Suspense>
        <LoginDialogUrlSync onOpen={openLoginDialog} />
      </Suspense>
      {children}
    </LoginDialogContext.Provider>
  );
}

export function useLoginDialog() {
  const context = useContext(LoginDialogContext);
  if (context === undefined) {
    throw new Error('useLoginDialog must be used within a LoginDialogProvider');
  }
  return context;
}
