/**
 * Pins: cost reads the same everywhere: two decimals from one cent up, `<$0.01` below it, a dash
 * for a missing or not-recorded value (never `$0.00`), and the card split lists Director then
 * tickets.
 *
 * Why: the Board tile, both page headers and the breakdown tables share this wording; a free
 *   run and an unreported run must never look alike, and a half-cent must not round to "free".
 * Depends on: src/domain/cost-display. Pure.
 */

import { describe, expect, it } from 'vitest';
import { cardCostSplit, costText, recordedUsd } from '#/domain/cost-display.js';

describe('costText', () => {
  it('shows two decimals from one cent up', () => {
    expect(costText(0.01)).toBe('$0.01');
    expect(costText(1.9)).toBe('$1.90');
    expect(costText(1234.5)).toBe('$1,234.50');
  });

  it('says <$0.01 for a positive amount under a cent, and $0.00 only for a recorded zero', () => {
    expect(costText(0.004)).toBe('<$0.01');
    expect(costText(0)).toBe('$0.00');
  });

  it('shows a dash for a missing value or one the harness did not record', () => {
    expect(costText(undefined)).toBe('—');
    expect(costText(null)).toBe('—');
    expect(costText(0, false)).toBe('—');
    expect(costText(2.5, false)).toBe('—');
  });
});

describe('recordedUsd', () => {
  it('returns the dollars only when recorded', () => {
    expect(recordedUsd({ usd: 0.3, recorded: true })).toBe(0.3);
    expect(recordedUsd({ usd: 0, recorded: false })).toBeUndefined();
    expect(recordedUsd({})).toBeUndefined();
  });
});

describe('cardCostSplit', () => {
  it('lists the Director then the tickets, formatted', () => {
    expect(cardCostSplit({ director_usd: 0.41, tickets_usd: 0.005 })).toEqual([
      { label: 'Director', text: '$0.41' },
      { label: 'Tickets', text: '<$0.01' },
    ]);
  });
});
