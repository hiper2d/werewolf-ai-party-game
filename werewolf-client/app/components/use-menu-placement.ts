'use client';

import { RefObject, useLayoutEffect, useState } from 'react';

/**
 * Where a dropdown's menu should open, given the room around its trigger:
 * below when it fits, above when only that fits, and as a centered popup
 * when neither does (a select near the bottom of a short viewport used to
 * open into nothing and get clipped). Re-measured on scroll and resize while
 * the menu is open, so a menu that was fine can't be pushed off-screen.
 */
export type MenuPlacement = 'below' | 'above' | 'center';

// Breathing room between the menu and the viewport edge.
const EDGE_MARGIN = 12;

export function useMenuPlacement(anchorRef: RefObject<HTMLElement | null>, open: boolean, menuHeight: number): MenuPlacement {
    const [placement, setPlacement] = useState<MenuPlacement>('below');

    useLayoutEffect(() => {
        if (!open) return;
        const measure = () => {
            const rect = anchorRef.current?.getBoundingClientRect();
            if (!rect) return;
            const below = window.innerHeight - rect.bottom - EDGE_MARGIN;
            const above = rect.top - EDGE_MARGIN;
            setPlacement(below >= menuHeight ? 'below' : above >= menuHeight ? 'above' : 'center');
        };
        measure();
        window.addEventListener('resize', measure);
        window.addEventListener('scroll', measure, true);
        return () => {
            window.removeEventListener('resize', measure);
            window.removeEventListener('scroll', measure, true);
        };
    }, [open, anchorRef, menuHeight]);

    return placement;
}

// Literal class strings on purpose: Tailwind only generates classes it can
// see in the source, so the width can't be interpolated.
const CENTER_WIDTH = {
    sm: 'w-[min(360px,calc(100vw-32px))]',
    md: 'w-[min(420px,calc(100vw-32px))]',
    lg: 'w-[min(520px,calc(100vw-32px))]',
} as const;

/** Positioning classes for a menu by placement. The centered popup is fixed
 * and viewport-sized; the anchored ones hang off the trigger. */
export function menuPlacementClass(placement: MenuPlacement, centerWidth: keyof typeof CENTER_WIDTH = 'lg'): string {
    switch (placement) {
        case 'above':
            return 'absolute z-50 w-full bottom-full mb-1.5';
        case 'center':
            return `fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 ${CENTER_WIDTH[centerWidth]}`;
        default:
            return 'absolute z-50 w-full top-full mt-1.5';
    }
}
