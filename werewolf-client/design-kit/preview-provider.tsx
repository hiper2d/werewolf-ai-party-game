'use client';

import React, { useEffect } from 'react';

/**
 * Preview wrapper for the design kit. In the app, the theme attribute and the
 * next/font CSS variables are set by the root layout; outside the app (design
 * previews, the claude.ai/design runtime) nothing sets them, so every token in
 * globals.css would be undefined. This provider supplies both: the dark theme
 * attribute on <html> (the app's default look) and the three font variables
 * mapped to the family names the compiled CSS @font-face rules declare.
 */
export function DesignPreviewProvider({ children }: { children?: React.ReactNode }) {
    useEffect(() => {
        if (!document.documentElement.dataset.theme) {
            document.documentElement.dataset.theme = 'dark';
        }
    }, []);
    return (
        <>
            <style>{`
                :root {
                    --font-inter: 'Inter';
                    --font-jetbrains-mono: 'JetBrains Mono';
                    --font-roboto-mono: 'Roboto Mono';
                }
                body { background: var(--bg-0); color: var(--fg-0); font-family: var(--font-inter), system-ui, sans-serif; }
            `}</style>
            {children}
        </>
    );
}
