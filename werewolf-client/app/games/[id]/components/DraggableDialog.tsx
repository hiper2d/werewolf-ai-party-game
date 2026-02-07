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
            className={`z-50 bg-white dark:bg-neutral-900 border theme-border rounded-lg shadow-xl ${className}`}
            style={dialogStyle}
        >
            {/* Draggable header */}
            <div
                className={`px-6 pt-6 pb-2 cursor-move select-none ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
                onMouseDown={handleMouseDown}
            >
                <h3 className="text-xl font-bold theme-text-primary">
                    {title}
                </h3>
            </div>
            {/* Content */}
            <div className="px-6 pb-6">
                {children}
            </div>
        </div>
    );
}
