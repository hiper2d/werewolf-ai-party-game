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
        <div
            style={{
                position: 'fixed', inset: 0,
                background: 'rgba(5,5,10,0.78)',
                backdropFilter: 'blur(2px)',
                zIndex: 1000,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            onClick={onCancel}
        >
            <div
                onClick={e => e.stopPropagation()}
                style={{
                    width: 420, maxWidth: '92vw',
                    background: 'var(--ember-bg-2)',
                    border: '2px solid var(--ember-blood-3)',
                    boxShadow: '0 0 0 2px var(--ember-bg-0), 0 0 0 4px var(--ember-blood-3), 8px 8px 0 rgba(0,0,0,0.6)',
                }}
            >
                {/* Header */}
                <div style={{
                    padding: '12px 16px',
                    background: 'var(--ember-bg-0)',
                    borderBottom: '2px solid var(--ember-blood-3)',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                    <div className="pixel-text" style={{ fontSize: 11, color: 'var(--ember-blood-3)', letterSpacing: 2 }}>
                        ▸ {title.toUpperCase()}
                    </div>
                    <button onClick={onCancel} className="pixel-text" style={{ fontSize: 12, color: 'var(--ember-ink-2)', cursor: 'pointer', background: 'none', border: 'none' }}>
                        ✕
                    </button>
                </div>

                {/* Body */}
                <div style={{ padding: 20 }}>
                    <p style={{ color: 'var(--ember-ink-1)', margin: '0 0 20px 0', fontSize: 14, lineHeight: 1.55 }}>
                        {message}
                    </p>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                        <button className="pbtn pbtn-ghost" onClick={onCancel}>
                            {cancelLabel.toUpperCase()}
                        </button>
                        <button className="pbtn pbtn-danger" onClick={onConfirm}>
                            ▸ {confirmLabel.toUpperCase()}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
