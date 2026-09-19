'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { THEMES, THEME_STORAGE_KEY, ThemeDef, resolveThemeId, themeById } from '@/app/utils/themes';

interface ThemeContextType {
  /** Current theme id (see THEMES). */
  theme: string;
  /** Full definition of the current theme. */
  themeDef: ThemeDef;
  setTheme: (theme: string) => void;
  /** Flip to the other base family's default theme (dark ⇄ light). */
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<string>('dark');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Same resolution as the pre-paint script in layout.tsx: stored theme
    // (ignored if it no longer exists) or the OS preference.
    let stored: string | null = null;
    try { stored = localStorage.getItem(THEME_STORAGE_KEY); } catch {}
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    setThemeState(resolveThemeId(stored, prefersDark));
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const def = themeById(theme) ?? THEMES[0];
    document.documentElement.setAttribute('data-theme', def.id);
    document.documentElement.setAttribute('data-base', def.base);
    try { localStorage.setItem(THEME_STORAGE_KEY, def.id); } catch {}
  }, [theme, mounted]);

  const setTheme = (newTheme: string) => {
    if (themeById(newTheme)) setThemeState(newTheme);
  };

  const toggleTheme = () => {
    setThemeState((prev) => ((themeById(prev)?.base ?? 'dark') === 'light' ? 'dark' : 'light'));
  };

  const themeDef = themeById(theme) ?? THEMES[0];

  // Always provide context, even during initial render to prevent errors
  return (
    <ThemeContext.Provider value={{ theme, themeDef, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
