/**
 * UI color themes. Every theme has a BASE (dark or light): the base supplies
 * the full token set in globals.css via `[data-base='…']`, and a theme's own
 * `[data-theme='…']` block only overrides what differs. Both attributes are
 * set on <html> (by the pre-paint script in layout.tsx and by ThemeProvider),
 * and Tailwind's `dark:` variant keys off data-base, so a new dark-family
 * theme picks up every existing dark style for free.
 *
 * Each base family has a default theme whose tokens ARE the base block
 * (Dark for dark, Overcast for light), so those two need no override block.
 */
export type ThemeBase = 'dark' | 'light';

export interface ThemeDef {
    id: string;
    name: string;
    base: ThemeBase;
}

export const THEMES: readonly ThemeDef[] = [
    { id: 'dark', name: 'Dark', base: 'dark' },
    { id: 'overcast', name: 'Overcast', base: 'light' },
    // Theme directions from the Claude Design canvas (Theme Directions.dc.html,
    // Sep 2026): each is a pure token swap over its base. The light-family
    // trio (Overcast, Linen, Dusk) replaced the original glare-white Light.
    { id: 'blood-moon', name: 'Blood Moon', base: 'dark' },
    { id: 'moonlit-forest', name: 'Moonlit Forest', base: 'dark' },
    { id: 'noir', name: 'Noir Terminal', base: 'dark' },
    { id: 'linen', name: 'Linen', base: 'light' },
    { id: 'dusk', name: 'Dusk', base: 'light' },
    { id: 'candlelight', name: 'Candlelight', base: 'light' },
];

export const THEME_STORAGE_KEY = 'theme';

/** The theme each base family falls back to (OS preference, toggle). */
export const DEFAULT_THEME_ID: Record<ThemeBase, string> = { dark: 'dark', light: 'overcast' };

/** Retired ids that may still sit in localStorage → their replacement. */
export const LEGACY_THEME_IDS: Record<string, string> = { light: 'overcast' };

/** id → base, in the shape the inline pre-paint script embeds. */
export const THEME_BASES: Record<string, ThemeBase> = Object.fromEntries(THEMES.map(t => [t.id, t.base]));

export function themeById(id: string | null | undefined): ThemeDef | undefined {
    return THEMES.find(t => t.id === id);
}

/** The theme to apply given a stored value (possibly stale) and the OS preference. */
export function resolveThemeId(stored: string | null | undefined, prefersDark: boolean): string {
    const id = stored ? (LEGACY_THEME_IDS[stored] ?? stored) : null;
    if (id && THEME_BASES[id]) return id;
    return DEFAULT_THEME_ID[prefersDark ? 'dark' : 'light'];
}
