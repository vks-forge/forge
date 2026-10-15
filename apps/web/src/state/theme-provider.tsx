/**
 * Theme provider: keeps the light, dark or system choice and applies it to the page.
 *
 * Why: the app follows the OS until the user picks a theme (d-0103 dark and light), and the
 *   pick must stick across reloads. The choice lives in a persisted zustand store
 *   (`forge.ui.theme`, d-0122), which reads synchronously at start so the first paint already
 *   has the right theme. The provider writes it to `<html data-theme>` (the tokens in
 *   theme/tokens.css key off it; `system` removes the attribute so the media query rules).
 *   Blocked storage only means the choice lasts for this tab.
 *
 * Exports: ThemeProvider, useTheme(), themePrefsStore.
 * Depends on: react, state/create-persisted-store, domain/theme-mode, schemas/ui-state,
 *   types/nav.types, types/state.types, types/ui-state.types. IO: <html>.
 */

import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { nextThemeMode } from '#/domain/theme-mode.js';
import { ThemePrefsSchema } from '#/schemas/ui-state.js';
import { createPersistedStore } from '#/state/create-persisted-store.js';
import type { ThemeMode } from '#/types/nav.types.js';
import type { ThemeContextValue } from '#/types/state.types.js';
import type { ThemePrefs } from '#/types/ui-state.types.js';

export const themePrefsStore = createPersistedStore<ThemePrefs>({
  name: 'theme',
  version: 1,
  initial: { mode: 'system' },
  schema: ThemePrefsSchema,
});

function apply(mode: ThemeMode): void {
  const root = document.documentElement;
  if (mode === 'system') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', mode);
  }
}

function setMode(mode: ThemeMode): void {
  themePrefsStore.setState({ mode });
}

function cycle(): void {
  setMode(nextThemeMode(themePrefsStore.getState().mode));
}

/** Applies the stored theme to the page; the choice itself needs no provider. */
export function ThemeProvider(props: { children: ReactNode }) {
  const mode = themePrefsStore((p) => p.mode);

  useEffect(() => apply(mode), [mode]);

  return props.children;
}

export function useTheme(): ThemeContextValue {
  const mode = themePrefsStore((p) => p.mode);

  return { mode, setMode, cycle };
}
