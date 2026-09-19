'use client';

import { useEffect, useRef, useState } from 'react';
import { useTheme } from '@/app/providers/ThemeProvider';
import { THEMES } from '@/app/utils/themes';

function MoonIcon() {
  return (
    <svg className="theme-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg className="theme-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  );
}

/**
 * Theme menu in the navbar: the pill shows the current theme (sun/moon for its
 * base family); clicking opens a list of every theme with a two-tone swatch
 * (page background + accent) drawn from that theme's own tokens.
 */
export default function ThemeSwitcher() {
  const { theme, themeDef, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="theme-toggle"
        aria-label="Choose theme"
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Choose theme"
      >
        {themeDef.base === 'light' ? <SunIcon /> : <MoonIcon />}
        <span className="theme-name">{themeDef.name}</span>
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label="Theme"
          className="theme-menu absolute right-0 top-[calc(100%+6px)] z-50 min-w-[190px] py-1"
        >
          {THEMES.map(t => {
            const selected = t.id === theme;
            return (
              <li key={t.id} role="option" aria-selected={selected}>
                <button
                  type="button"
                  onClick={() => { setTheme(t.id); setOpen(false); }}
                  className={`theme-menu-item ${selected ? 'is-selected' : ''}`}
                >
                  {/* Swatch scoped to the option's theme so it previews the real tokens. */}
                  <span className="theme-swatch" data-theme={t.id} data-base={t.base} aria-hidden="true">
                    <span className="theme-swatch-accent" />
                  </span>
                  <span className="flex-1 text-left">{t.name}</span>
                  <span className="theme-menu-kind">{t.base}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
