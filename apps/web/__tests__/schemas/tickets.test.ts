/**
 * Pins: a ticket detail from a server that predates `needs_you_detail` still parses and reads as
 * no waiting items, and the items a current server sends are kept as sent.
 *
 * Why: the Ticket page draws its dock from this list. One reply that failed to parse would blank
 * the whole page, so an older server must read as "nothing waiting" rather than an error.
 * Depends on: schemas/tickets.
 */

import { describe, expect, it } from 'vitest';
import { TicketDetail } from '#/schemas/tickets.js';

const base = {
  ticket: {
    id: 'FG-7',
    project: 'demo',
    title: 'Add login',
    body: 'b',
    type: 'feat',
    lane: 'express',
    tier_predicted: 'A',
    status: 'review',
    status_version: 0,
    rework_count: 0,
    priority: 0,
    created_at: '2026-10-19T09:00:00.000Z',
    updated_at: '2026-10-19T10:00:00.000Z',
    blocked_by: [],
  },
  runs: [],
  gate_results: [],
  interactions: [],
  wait_reason: null,
};

describe('TicketDetail needs_you_detail', () => {
  it('reads a reply that predates the field as no items', () => {
    expect(TicketDetail.parse(base).needs_you_detail).toEqual([]);
  });

  it('keeps the items the server sends', () => {
    const item = {
      kind: 'ticket_review',
      title: 'FG-7 is ready for review',
      items: [],
      actions: ['approve', 'rework', 'cancel'],
      raised_at: '2026-10-19T10:00:00.000Z',
      seq: null,
      ticket_id: 'FG-7',
    };

    const parsed = TicketDetail.parse({ ...base, needs_you_detail: [item] });

    expect(parsed.needs_you_detail).toEqual([item]);
  });
});
