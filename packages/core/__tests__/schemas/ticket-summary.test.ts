/**
 * Ticket list schemas: the query a Board may send and the card it gets back.
 *
 * Why: the query is untrusted URL text. A page size above the cap would let one request
 * read the whole table, and a status outside the machine's set would silently match
 * nothing and show an empty column instead of an error.
 *
 * Pins: limit default, bounds and coercion; state must be a ticket status; the summary
 * rejects a malformed id.
 * Depends on: src/schemas/ticket-summary.
 */

import { describe, expect, it } from 'vitest';
import { TicketListQuery, TicketSummary } from '#/schemas/ticket-summary.js';

describe('TicketListQuery', () => {
  it('defaults the limit to 100 and coerces a numeric string', () => {
    const defaulted = TicketListQuery.parse({});
    const coerced = TicketListQuery.parse({ limit: '25' });

    expect(defaulted.limit).toBe(100);
    expect(coerced.limit).toBe(25);
  });

  it('refuses limits outside 1..500 and non-numbers', () => {
    const results = [0, 501, 'abc', '1.5'].map(
      (limit) => TicketListQuery.safeParse({ limit }).success,
    );

    expect(results).toEqual([false, false, false, false]);
  });

  it('accepts only ticket statuses in state', () => {
    const ok = TicketListQuery.safeParse({ state: ['inbox', 'needs_signoff'] });
    const bad = TicketListQuery.safeParse({ state: ['inbox', 'open'] });

    expect(ok.success).toBe(true);
    expect(bad.success).toBe(false);
  });
});

describe('TicketListQuery filters and paging', () => {
  it('defaults sort to updated and accepts lane, card, q, offset', () => {
    const parsed = TicketListQuery.parse({
      lane: 'express',
      card: 'FG-C2',
      q: ' fix ',
      sort: 'cost',
      offset: '40',
    });

    expect(parsed).toMatchObject({
      lane: 'express',
      card: 'FG-C2',
      q: 'fix',
      sort: 'cost',
      offset: 40,
    });

    expect(TicketListQuery.parse({}).sort).toBe('updated');
  });

  it('refuses an unknown sort, lane, card id, blank q and a negative offset', () => {
    const results = [
      { sort: 'name' },
      { lane: 'warp' },
      { card: 'nope' },
      { q: '   ' },
      { offset: -1 },
    ].map((q) => TicketListQuery.safeParse(q).success);

    expect(results).toEqual([false, false, false, false, false]);
  });
});

describe('TicketSummary', () => {
  it('rejects an id that is not PREFIX-n', () => {
    const base = {
      title: 't',
      state: 'inbox',
      lane: 'express',
      type: 'feat',
      tier_predicted: 'A',
      project: 'p',
      priority: 0,
      rework_count: 0,
      needs_you: false,
      created_at: '2026-10-13T00:00:00.000Z',
      updated_at: '2026-10-13T00:00:00.000Z',
    };

    expect(TicketSummary.safeParse({ ...base, id: 'FX-1' }).success).toBe(true);
    expect(TicketSummary.safeParse({ ...base, id: 'nope' }).success).toBe(false);
  });
});
