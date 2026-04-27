'use client';

import React from 'react';
import { getAvatarGradient } from '@/app/utils/color-utils';

interface PlayerAvatarProps {
    name: string;
    size?: number; // px, default 32
    isGM?: boolean;
    isDead?: boolean;
    className?: string;
}

export default function PlayerAvatar({ name, size = 32, isGM = false, isDead = false, className = '' }: PlayerAvatarProps) {
    const [c1, c2] = getAvatarGradient(name);
    const initial = name.charAt(0).toUpperCase();
    const fontSize = Math.round(size * 0.42);

    return (
        <div
            className={`flex-none rounded-full flex items-center justify-center font-semibold relative ${isDead ? 'grayscale brightness-75' : ''} ${className}`}
            style={{
                width: size,
                height: size,
                background: `linear-gradient(135deg, ${c1} 0%, ${c2} 100%)`,
                fontSize,
                color: 'white',
                border: '1px solid rgba(0,0,0,0.2)',
            }}
        >
            {isGM ? (
                <span className="text-[9px] font-mono font-bold tracking-wider">GM</span>
            ) : isDead ? (
                <svg width={fontSize} height={fontSize} viewBox="0 0 14 14" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.8">
                    <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" />
                </svg>
            ) : (
                initial
            )}
        </div>
    );
}
