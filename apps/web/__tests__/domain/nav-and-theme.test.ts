/**
 * Pins: URLs are built per project and per Forge settings, switching project keeps the same
 * screen, and the theme toggle cycles system, light, dark.
 *
 * Why: the project switcher promises "same screen, other project" (d-0104) and the theme
 *   toggle must always move to a different mode. Both rules are tiny and every screen
 *   depends on them.
 * Depends on: src/domain/nav-entries, src/domain/theme-mode. No IO.
 */

import { describe, expect, it } from 'vitest';
import {
  PROJECT_NAV,
  projectPath,
  SETTINGS_NAV,
  settingsPath,
  swapProjectSlug,
} from '#/domain/nav-entries.js';
import { describeThemeMode, nextThemeMode } from '#/domain/theme-mode.js';

describe('nav entries', () => {
  it('builds project and settings URLs', () => {
    expect(projectPath('alpha')).toBe('/p/alpha');
    expect(projectPath('alpha', 'board')).toBe('/p/alpha/board');
    expect(settingsPath('harnesses')).toBe('/settings/harnesses');
  });

  it('keeps the screen when the slug changes and falls back to Home elsewhere', () => {
    expect(swapProjectSlug('/p/alpha/board', 'beta')).toBe('/p/beta/board');
    expect(swapProjectSlug('/p/alpha', 'beta')).toBe('/p/beta');
    expect(swapProjectSlug('/p/alpha/', 'beta')).toBe('/p/beta');
    expect(swapProjectSlug('/settings/limits', 'beta')).toBe('/p/beta');
    expect(swapProjectSlug('/', 'beta')).toBe('/p/beta');
  });

  it('gives every entry a batch and a unique segment', () => {
    for (const list of [PROJECT_NAV, SETTINGS_NAV]) {
      expect(new Set(list.map((e) => e.segment)).size).toBe(list.length);
      for (const entry of list) {
        expect(entry.batch).toMatch(/^W[1-8]$/);
      }
    }
  });
});

describe('theme mode', () => {
  it('cycles system, light, dark and back', () => {
    expect(nextThemeMode('system')).toBe('light');
    expect(nextThemeMode('light')).toBe('dark');
    expect(nextThemeMode('dark')).toBe('system');
  });

  it('describes both the current mode and what a press does', () => {
    expect(describeThemeMode('light')).toBe('Theme: light. Switch to dark.');
  });
});
