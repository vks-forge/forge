/**
 * Pins: the rail opens on the plan while one exists, else the tickets while work exists, else
 * the details.
 *
 * Why: from 1280 px the Conversation address no longer names a rail tab, but the rail must not
 *   open empty. A card with a plan to review shows it beside the chat; a card with only work
 *   shows its tickets; a brand new card shows its details instead of a blank panel.
 * Depends on: src/domain/card-rail. No IO.
 */

import { describe, expect, it } from 'vitest';
import { defaultRailTab } from '#/domain/card-rail.js';

describe('defaultRailTab', () => {
  it('prefers the plan', () => {
    expect(defaultRailTab({ hasPlan: true, ticketCount: 4 })).toBe('plan');
  });

  it('falls back to the tickets, then the details', () => {
    expect(defaultRailTab({ hasPlan: false, ticketCount: 2 })).toBe('tickets');
    expect(defaultRailTab({ hasPlan: false, ticketCount: 0 })).toBe('details');
  });
});
