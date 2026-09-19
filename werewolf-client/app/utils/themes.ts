/**
 * UI color themes. Every theme has a BASE (dark or light): the base supplies
 * the full token set in globals.css via `[data-base='…']`, and a theme's own
 * `[data-theme='…']` block only overrides what differs. Both attributes are
 * set on <html> (by the pre-paint script in layout.tsx and by ThemeProvider),
 * and Tailwind's `dark:` variant keys off data-base, so a new dark-family
 * theme picks up every existing dark style for free.
 */
export type ThemeBase = 'dark' | 'light';

export interface ThemeDef {
    id: string;
    name: string;
    base: ThemeBase;
}

export const THEMES: readonly ThemeDef[] = [
    { id: 'dark', name: 'Dark', base: 'dark' },
    { id: 'light', name: 'Light', base: 'light' },
    // Theme directions from the Claude Design canvas (Theme Directions.dc.html,
    // Sep 2026): each is a pure token swap over its base.
    { id: 'blood-moon', name: 'Blood Moon', base: 'dark' },
    { id: 'moonlit-forest', name: 'Moonlit Forest', base: 'dark' },
    { id: 'candlelight', name: 'Candlelight', base: 'light' },
    { id: 'noir', name: 'Noir Terminal', base: 'dark' },
];

export const THEME_STORAGE_KEY = 'theme';

/** id → base, in the shape the inline pre-paint script embeds. */
export const THEME_BASES: Record<string, ThemeBase> = Object.fromEntries(THEMES.map(t => [t.id, t.base]));

export function themeById(id: string | null | undefined): ThemeDef | undefined {
    return THEMES.find(t => t.id === id);
}

/** The theme to apply given a stored value (possibly stale) and the OS preference. */
export function resolveThemeId(stored: string | null | undefined, prefersDark: boolean): string {
    if (stored && THEME_BASES[stored]) return stored;
    return prefersDark ? 'dark' : 'light';
}
