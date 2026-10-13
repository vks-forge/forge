/**
 * Tests for ticket id construction and parsing.
 *
 * Why: ids key every row and appear in branches and the UI. A parser that throws would
 *   crash the Director tick on one bad chat message or foreign branch, and a lax one
 *   could address the wrong ticket.
 *
 * Pins: `<PROJECT>-<n>` format, rejection of bad prefixes/numbers, non-throwing parse,
 *   make/parse round trip (property).
 * Depends on: src/domain/ids, fast-check, vitest.
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeTicketId, parseTicketId } from '#/domain/ids.js';

describe('ids', () => {
  it('makes <PROJECT>-<n>', () => {
    expect(makeTicketId('SF', 12)).toBe('SF-12');
  });

  it('rejects bad prefixes and numbers', () => {
    expect(() => makeTicketId('sf', 1)).toThrow();
    expect(() => makeTicketId('SF', 0)).toThrow();
    expect(() => makeTicketId('SF', 1.5)).toThrow();
  });

  it('parses valid ids and reports invalid ones without throwing', () => {
    const ok = parseTicketId('SF-7');
    expect(ok).toEqual({ ok: true, value: { project: 'SF', n: 7 } });
    for (const bad of ['', 'SF', 'SF-', 'SF-0', 'sf-1', 'SF-1-x', '-1', 'SF-01']) {
      expect(parseTicketId(bad).ok).toBe(false);
    }
  });

  it('round-trips make -> parse', () => {
    const prefix = fc
      .tuple(
        fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')),
        fc.stringMatching(/^[A-Z0-9]{0,9}$/),
      )
      .map(([a, b]) => a + b);

    fc.assert(
      fc.property(prefix, fc.integer({ min: 1, max: 1_000_000 }), (p, n) => {
        const parsed = parseTicketId(makeTicketId(p, n));
        expect(parsed).toEqual({ ok: true, value: { project: p, n } });
      }),
    );
  });
});
