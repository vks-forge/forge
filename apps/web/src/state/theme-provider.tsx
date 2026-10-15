/**
 * Theme provider: keeps the light, dark or system choice and applies it to the page.
 *
 * Why: the app follows the OS until the user picks a theme (d-0103 dark and light), and the
 *   pick must stick across reloads. The choice is written to `<html data-theme>` (the tokens
 *   in theme/tokens.css key off it; `system` removes the attribute so the media query rules)
 *   and to `localStorage`, which may be blocked in private modes and must never crash the app.
 *
 * Exports: ThemeProvider, useTheme().
 * Depends on: react, domain/theme-mode, types/state.types. IO: localStorage, <html>.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { nextThemeMode, parseThemeMode, THEME_STORAGE_KEY } from '#/domain/theme-mode.js';
import type { ThemeMode } from '#/types/nav.types.js';
import type { ThemeContextValue } from '#/types/state.types.js';

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStored(): ThemeMode {
  try {
    return parseThemeMode(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return 'system';
  }
}

function apply(mode: ThemeMode): void {
  const root = document.documentElement;
  if (mode === 'system') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', mode);
  }
}

export function ThemeProvider(props: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(readStored);

  useEffect(() => apply(mode), [mode]);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // The choice still applies for this session.
    }
  }, []);

  const cycle = useCallback(() => setMode(nextThemeMode(mode)), [mode, setMode]);
  const value = useMemo(() => ({ mode, setMode, cycle }), [mode, setMode, cycle]);

  return <ThemeContext.Provider value={value}>{props.children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (value === null) {
    throw new Error('useTheme() must be used inside <ThemeProvider>.');
  }

  return value;
}
