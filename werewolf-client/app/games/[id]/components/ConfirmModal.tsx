'use client';

import React from 'react';
import { buttonTransparentStyle } from '@/app/constants';

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
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/60"
                onClick={onCancel}
            />
            {/* Dialog */}
            <div className="relative z-10 max-w-md w-full mx-4 border theme-border rounded-lg shadow-xl" style={{ backgroundColor: 'rgb(var(--color-card-bg))' }}>
                <div className="px-6 pt-6 pb-2">
                    <h3 className="text-xl font-bold theme-text-primary">{title}</h3>
                </div>
                <div className="px-6 pb-6">
                    <p className="theme-text-secondary mb-6">{message}</p>
                    <div className="flex justify-end gap-3">
                        <button
                            className={`${buttonTransparentStyle} rounded`}
                            onClick={onCancel}
                        >
                            {cancelLabel}
                        </button>
                        <button
                            className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded transition-colors"
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
