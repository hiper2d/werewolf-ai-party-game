'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';

interface DraggableDialogProps {
    isOpen: boolean;
    children: React.ReactNode;
    title: string;
    className?: string;
}

export default function DraggableDialog({
    isOpen,
    children,
    title,
    className = ''
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
        <div
            ref={dialogRef}
            className={`z-50 bg-[var(--bg-1)] border border-[var(--line-1)] rounded-[var(--radius-xl)] shadow-pop ${className}`}
            style={dialogStyle}
        >
            {/* Draggable header */}
            <div
                className={`px-5 pt-5 pb-2 cursor-move select-none ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
                onMouseDown={handleMouseDown}
            >
                <h3 className="text-[16px] font-semibold text-[var(--fg-0)]">
                    {title}
                </h3>
            </div>
            {/* Content */}
            <div className="px-5 pb-5">
                {children}
            </div>
        </div>
    );
}
