/**
 * Theme choice rules: what is stored, how the toggle cycles, how it reads aloud.
 *
 * Why: the app follows the OS light or dark setting until the user chooses, and the choice must
 *   survive a reload. These rules are pure so the provider only wires them to `localStorage`
 *   and `<html data-theme>`, and so a corrupted stored value falls back to `system` instead
 *   of breaking the first paint.
 *
 * Exports: THEME_STORAGE_KEY, parseThemeMode(), nextThemeMode(), describeThemeMode().
 * Depends on: types/nav.types. No IO.
 */

import type { ThemeMode } from '#/types/nav.types.js';

export const THEME_STORAGE_KEY = 'forge.theme';

/** A stored value, or `system` when it is absent or not one of the three modes. */
export function parseThemeMode(raw: string | null | undefined): ThemeMode {
  return raw === 'light' || raw === 'dark' ? raw : 'system';
}

/** system, then light, then dark, then back to system. */
export function nextThemeMode(mode: ThemeMode): ThemeMode {
  if (mode === 'system') {
    return 'light';
  }

  return mode === 'light' ? 'dark' : 'system';
}

/** Text for the toggle's accessible name: where we are and what a press does. */
export function describeThemeMode(mode: ThemeMode): string {
  return `Theme: ${mode}. Switch to ${nextThemeMode(mode)}.`;
}
