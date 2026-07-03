'use client';

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

interface ExpandableTextareaProps {
    value: string;
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
    className?: string;
    placeholder?: string;
    id?: string;
    /** Collapsed height in pixels. When collapsed, content beyond this is clipped. */
    minHeight?: number;
    'aria-label'?: string;
}

/**
 * A textarea that stays compact by default but expands to fit its full content
 * on click/focus, so long stories don't have to be scrolled inside a tiny box.
 * A pill toggle in the top-right lets the user expand/collapse explicitly.
 */
export default function ExpandableTextarea({
    value,
    onChange,
    className = '',
    placeholder,
    id,
    minHeight = 70,
    ...rest
}: ExpandableTextareaProps) {
    const ref = useRef<HTMLTextAreaElement>(null);
    const [expanded, setExpanded] = useState(false);
    const [overflowing, setOverflowing] = useState(false);

    // Keep the height in sync with expansion state and content.
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        if (expanded) {
            el.style.height = 'auto';
            el.style.height = `${el.scrollHeight}px`;
        } else {
            el.style.height = `${minHeight}px`;
            setOverflowing(el.scrollHeight > minHeight + 1);
        }
    }, [value, expanded, minHeight]);

    // Re-measure collapsed overflow on resize (text reflows at different widths).
    useEffect(() => {
        if (expanded) return;
        const onResize = () => {
            const el = ref.current;
            if (!el) return;
            setOverflowing(el.scrollHeight > minHeight + 1);
        };
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, [expanded, minHeight]);

    return (
        <div className="relative">
            <textarea
                ref={ref}
                id={id}
                value={value}
                placeholder={placeholder}
                onChange={(e) => {
                    onChange(e);
                    if (expanded && ref.current) {
                        ref.current.style.height = 'auto';
                        ref.current.style.height = `${ref.current.scrollHeight}px`;
                    }
                }}
                onFocus={() => setExpanded(true)}
                className={`${className} ${expanded ? 'resize-y' : 'resize-none overflow-hidden cursor-pointer'}`}
                {...rest}
            />
            {(overflowing || expanded) && (
                <button
                    type="button"
                    onClick={() => setExpanded(v => !v)}
                    className="absolute top-1.5 right-1.5 flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--bg-3)]/90 backdrop-blur-sm border border-[var(--line-2)] text-[10px] font-medium text-[var(--fg-2)] hover:text-[var(--fg-0)] hover:border-[var(--line-3)] transition-all duration-[120ms]"
                    title={expanded ? 'Collapse' : 'Expand'}
                >
                    <svg
                        width="10"
                        height="10"
                        viewBox="0 0 10 10"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className={`transition-transform duration-[160ms] ${expanded ? 'rotate-180' : ''}`}
                    >
                        <path d="M2.5 3.5L5 6L7.5 3.5" />
                    </svg>
                    {expanded ? 'Collapse' : 'Expand'}
                </button>
            )}
        </div>
    );
}
