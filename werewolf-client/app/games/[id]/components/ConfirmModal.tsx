'use client';

import React from 'react';

interface ConfirmModalProps {
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    onConfirm: () => void;
    onCancel: () => void;
}

export default function ConfirmModal({
    isOpen,
    title,
    message,
    confirmLabel = 'Delete',
    cancelLabel = 'Cancel',
    onConfirm,
    onCancel,
}: ConfirmModalProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />
            <div className="relative z-10 max-w-md w-full mx-4 bg-[var(--bg-1)] border border-[var(--line-1)] rounded-[var(--radius-xl)] shadow-pop">
                <div className="px-5 pt-5 pb-2">
                    <h3 className="text-[16px] font-semibold text-[var(--fg-0)]">{title}</h3>
                </div>
                <div className="px-5 pb-5">
                    <p className="text-[13px] text-[var(--fg-1)] mb-6">{message}</p>
                    <div className="flex justify-end gap-2">
                        <button
                            className="px-4 py-2 text-[13px] font-medium rounded-[var(--radius-md)] bg-[var(--bg-3)] border border-[var(--line-3)] text-[var(--fg-0)] hover:bg-[var(--bg-4)] transition-all duration-[120ms]"
                            onClick={onCancel}
                        >
                            {cancelLabel}
                        </button>
                        <button
                            className="px-4 py-2 text-[13px] font-medium rounded-[var(--radius-md)] bg-[var(--danger)] text-white hover:brightness-110 transition-all duration-[120ms]"
                            onClick={onConfirm}
                        >
                            {confirmLabel}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
