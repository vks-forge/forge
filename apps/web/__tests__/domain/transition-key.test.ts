/**
 * Pins: the tabs of one project's settings share a page-transition key; other URLs keep theirs.
 *
 * Why: a changed key remounts the screen. If a settings tab switch changed it, the editor
 * above the tabs would remount and drop unsaved edits; if other screens shared a key, moving
 * between them would lose the transition.
 * Depends on: src/domain/transition-key.
 */

import { describe, expect, it } from 'vitest';
import { transitionKey } from '#/domain/transition-key.js';

describe('transitionKey', () => {
  it('is the same for every tab of one project settings', () => {
    expect(transitionKey('/p/alpha/settings')).toBe('/p/alpha/settings');
    expect(transitionKey('/p/alpha/settings/workers')).toBe('/p/alpha/settings');
    expect(transitionKey('/p/alpha/settings/danger/')).toBe('/p/alpha/settings');
  });

  it('differs between projects and from other screens', () => {
    expect(transitionKey('/p/beta/settings/workers')).not.toBe(
      transitionKey('/p/alpha/settings/workers'),
    );

    expect(transitionKey('/p/alpha/board')).toBe('/p/alpha/board');
    expect(transitionKey('/settings/limits')).toBe('/settings/limits');
    expect(transitionKey('/p/alpha/settingsx')).toBe('/p/alpha/settingsx');
  });
});
