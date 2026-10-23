/**
 * Pins: cost reads the same everywhere: two decimals from one cent up, `<$0.01` below it, a dash
 * for a missing or not-recorded value (never `$0.00`), and every split lists Workers then the
 * Director.
 *
 * Why: the Board tile, both page headers and the breakdown tables share this wording; a free
 *   run and an unreported run must never look alike, and a half-cent must not round to "free".
 * Depends on: src/domain/cost-display. Pure.
 */

import { describe, expect, it } from 'vitest';
import {
  cardCostSplit,
  costText,
  recordedUsd,
  splitLine,
  ticketCostSplit,
} from '#/domain/cost-display.js';

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
  it('lists Workers then the Director, formatted', () => {
    expect(cardCostSplit({ director_usd: 0.41, tickets_usd: 0.005 })).toEqual([
      { label: 'Workers', text: '<$0.01' },
      { label: 'Director', text: '$0.41' },
    ]);
  });
});

describe('ticketCostSplit and splitLine', () => {
  it('uses the same two labels in the same order for a ticket', () => {
    expect(ticketCostSplit({ workers_usd: 7.43, director_usd: 16.86 })).toEqual([
      { label: 'Workers', text: '$7.43' },
      { label: 'Director', text: '$16.86' },
    ]);
  });

  it('writes the one-line split every screen shares', () => {
    expect(splitLine(7.43, 16.86)).toBe('Workers $7.43 · Director $16.86');
  });
});
