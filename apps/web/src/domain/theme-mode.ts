/**
 * Theme choice rules: how the toggle cycles and how it reads aloud.
 *
 * Why: the app follows the OS light or dark setting until the user chooses, and the toggle
 *   steps through system, light and dark. These rules are pure so the persisted theme store
 *   and the toggle share one cycle, and a screen reader hears where the user is and what a
 *   press does.
 *
 * Exports: nextThemeMode(), describeThemeMode().
 * Depends on: types/nav.types. No IO.
 */

import type { ThemeMode } from '#/types/nav.types.js';

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
