'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';

interface DraggableDialogProps {
    isOpen: boolean;
    children: React.ReactNode;
    title: string;
    className?: string;
    accent?: string;
    onClose?: () => void;
}

export default function DraggableDialog({
    isOpen,
    children,
    title,
    className = '',
    accent = 'var(--ember-fire-3)',
    onClose,
}: DraggableDialogProps) {
    const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const dialogRef = useRef<HTMLDivElement>(null);

    // Reset position when dialog opens
    useEffect(() => {
        if (isOpen) {
            setPosition(null);
        }
    }, [isOpen]);

    const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (!dialogRef.current) return;

        const rect = dialogRef.current.getBoundingClientRect();
        setDragOffset({
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        });
        setIsDragging(true);
    }, []);

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!isDragging || !dialogRef.current) return;

        const newX = e.clientX - dragOffset.x;
        const newY = e.clientY - dragOffset.y;

        // Keep dialog within viewport bounds
        const rect = dialogRef.current.getBoundingClientRect();
        const maxX = window.innerWidth - rect.width;
        const maxY = window.innerHeight - rect.height;

        setPosition({
            x: Math.max(0, Math.min(newX, maxX)),
            y: Math.max(0, Math.min(newY, maxY))
        });
    }, [isDragging, dragOffset]);

    const handleMouseUp = useCallback(() => {
        setIsDragging(false);
    }, []);

    useEffect(() => {
        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, handleMouseMove, handleMouseUp]);

    if (!isOpen) return null;

    const dialogStyle: React.CSSProperties = position
        ? {
            position: 'fixed',
            left: position.x,
            top: position.y,
            transform: 'none'
        }
        : {
            position: 'fixed',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)'
        };

    return (
        <>
            {/* Backdrop */}
            <div
                style={{
                    position: 'fixed', inset: 0,
                    background: 'rgba(5,5,10,0.78)',
                    backdropFilter: 'blur(2px)',
                    zIndex: 999,
                }}
                onClick={onClose}
            />
            <div
                ref={dialogRef}
                className={`${className}`}
                style={{
                    ...dialogStyle,
                    zIndex: 1000,
                    maxWidth: '92vw',
                    maxHeight: '86vh',
                    background: 'var(--ember-bg-2)',
                    border: `2px solid ${accent}`,
                    boxShadow: `0 0 0 2px var(--ember-bg-0), 0 0 0 4px ${accent}, 8px 8px 0 rgba(0,0,0,0.6)`,
                    display: 'flex',
                    flexDirection: 'column' as const,
                    overflow: 'hidden',
                    borderRadius: 0,
                }}
            >
                {/* Header bar */}
                <div
                    style={{
                        padding: '12px 16px',
                        background: 'var(--ember-bg-0)',
                        borderBottom: `2px solid ${accent}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                    }}
                    className={`select-none ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
                    onMouseDown={handleMouseDown}
                >
                    <div className="pixel-text" style={{ fontSize: 11, color: accent, letterSpacing: 2 }}>
                        ▸ {title.toUpperCase()}
                    </div>
                    {onClose && (
                        <button
                            onClick={onClose}
                            className="pixel-text"
                            style={{ fontSize: 12, color: 'var(--ember-ink-2)' }}
                        >
                            ✕
                        </button>
                    )}
                </div>
                {/* Content */}
                <div style={{ padding: 20, overflowY: 'auto' }}>
                    {children}
                </div>
            </div>
        </>
    );
}
