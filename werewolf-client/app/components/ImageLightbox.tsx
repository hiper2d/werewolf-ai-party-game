'use client';

import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

interface ImageLightboxProps {
    src: string;
    alt: string;
    onClose: () => void;
}

/**
 * Full-size view of a chat image. Rendered through a portal on <body> so the
 * chat's scroll container and any transformed ancestor can't clip or offset the
 * overlay; the image is shown at its stored resolution, letterboxed to the
 * viewport. Backdrop click, the close button and Escape all dismiss it, and the
 * page behind stops scrolling while it is open.
 */
export default function ImageLightbox({ src, alt, onClose }: ImageLightboxProps) {
    useEffect(() => {
        const originalOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', onKey);
        return () => {
            document.body.style.overflow = originalOverflow;
            document.removeEventListener('keydown', onKey);
        };
    }, [onClose]);

    if (typeof document === 'undefined') return null;

    return createPortal(
        <div
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-8 bg-black/80 backdrop-blur-sm cursor-zoom-out"
            role="dialog"
            aria-modal="true"
            aria-label={alt}
            onClick={onClose}
        >
            <button
                type="button"
                aria-label="Close"
                className="absolute top-3 right-3 p-2 rounded-[var(--radius-md)] text-white/80 hover:text-white hover:bg-white/10 transition-all duration-[120ms]"
                onClick={onClose}
            >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M6 6l12 12M18 6L6 18"/>
                </svg>
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element -- authed dynamic route; next/image can't optimize it */}
            <img
                src={src}
                alt={alt}
                className="max-w-full max-h-full object-contain rounded-[var(--radius-md)] shadow-pop cursor-default"
                onClick={(e) => e.stopPropagation()}
            />
        </div>,
        document.body,
    );
}
