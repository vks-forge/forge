/**
 * Pins: the tabs of one project's settings, one card or one ticket share a page-transition key; other URLs keep theirs.
 *
 * Why: a changed key remounts the screen. If a settings tab switch changed it, the editor
 * above the tabs would remount and drop unsaved edits, and a card or ticket tab switch would
 * replay the page animation and lose its scroll memory; if other screens shared a key, moving
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

  it('is the same for every tab of one card or one ticket, and differs between them', () => {
    expect(transitionKey('/p/alpha/cards/FX-C2')).toBe('/p/alpha/cards/FX-C2');
    expect(transitionKey('/p/alpha/cards/FX-C2/plan')).toBe('/p/alpha/cards/FX-C2');
    expect(transitionKey('/p/alpha/tickets/FX-4/runs')).toBe('/p/alpha/tickets/FX-4');
    expect(transitionKey('/p/alpha/cards/FX-C3/plan')).not.toBe(
      transitionKey('/p/alpha/cards/FX-C2/plan'),
    );
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
