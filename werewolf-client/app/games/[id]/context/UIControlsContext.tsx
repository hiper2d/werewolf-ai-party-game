'use client';

import { createContext, useContext, useState, useCallback, ReactNode, useMemo } from 'react';

// Modal identifiers for tracking which modals are open
export type ModalId =
  | 'modelSelection'
  | 'botSelection'
  | 'voting'
  | 'nightAction';

interface UIControlsContextType {
  // Track open modals
  openModals: Set<ModalId>;

  // Modal control functions
  openModal: (modalId: ModalId) => void;
  closeModal: (modalId: ModalId) => void;

  // Derived state for easy checking
  isAnyModalOpen: boolean;
  areControlsEnabled: boolean;

  // For checking specific modal
  isModalOpen: (modalId: ModalId) => boolean;
}

const UIControlsContext = createContext<UIControlsContextType | undefined>(undefined);

export function UIControlsProvider({ children }: { children: ReactNode }) {
  const [openModals, setOpenModals] = useState<Set<ModalId>>(new Set());

  const openModal = useCallback((modalId: ModalId) => {
    setOpenModals(prev => {
      const next = new Set(prev);
      next.add(modalId);
      return next;
    });
  }, []);

  const closeModal = useCallback((modalId: ModalId) => {
    setOpenModals(prev => {
      const next = new Set(prev);
      next.delete(modalId);
      return next;
    });
  }, []);

  const isModalOpen = useCallback((modalId: ModalId) => {
    return openModals.has(modalId);
  }, [openModals]);

  const value = useMemo(() => ({
    openModals,
    openModal,
    closeModal,
    isAnyModalOpen: openModals.size > 0,
    areControlsEnabled: openModals.size === 0,
    isModalOpen,
  }), [openModals, openModal, closeModal, isModalOpen]);

  return (
    <UIControlsContext.Provider value={value}>
      {children}
    </UIControlsContext.Provider>
  );
}

export function useUIControls() {
  const context = useContext(UIControlsContext);
  if (context === undefined) {
    throw new Error('useUIControls must be used within a UIControlsProvider');
  }
  return context;
}
