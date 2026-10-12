/**
 * Tests for the ticket schemas.
 *
 * Why: the ticket enums steer work: lane sets how much process runs, tier sets who signs
 *   off, status sets who acts next. A silently renamed or dropped value would misroute
 *   tickets (a tier-C change treated as auto-mergeable), so the documented sets are
 *   pinned and bad rows must be rejected (director-core.md §3-§4).
 *
 * Pins: documented enums (lanes, tiers, 8 types, five relation kinds, waiting_human), a
 *   valid ticket parses, bad id / status / negative version are rejected
 *   (director-core.md §3-§4).
 * Depends on: src/schemas/ticket, vitest.
 */

import { describe, expect, it } from 'vitest';
import {
  Lane,
  Ticket,
  TicketRelationKind,
  TicketStatus,
  TicketType,
  Tier,
} from '#/schemas/ticket.js';

const base = {
  id: 'SF-1',
  project: 'SF',
  title: 'Add doctor check',
  body: 'details',
  type: 'feat',
  lane: 'express',
  tier_predicted: 'A',
  status: 'inbox',
  status_version: 0,
  rework_count: 0,
  created_at: '2026-10-13T00:00:00.000Z',
  updated_at: '2026-10-13T00:00:00.000Z',
  blocked_by: [],
};

describe('ticket schemas', () => {
  it('exposes the documented enums', () => {
    expect(Lane.options).toEqual(['express', 'standard', 'full']);
    expect(Tier.options).toEqual(['A', 'B', 'C']);
    expect(TicketType.options).toHaveLength(8);
    expect(TicketRelationKind.options).toEqual([
      'blocks',
      'depends_on',
      'related',
      'supersedes',
      'spawned_from',
    ]);
    expect(TicketStatus.options).toContain('waiting_human');
  });

  it('parses a valid ticket', () => {
    expect(Ticket.safeParse(base).success).toBe(true);
  });

  it('rejects bad id, status and negative version', () => {
    expect(Ticket.safeParse({ ...base, id: 'bad' }).success).toBe(false);
    expect(Ticket.safeParse({ ...base, status: 'nope' }).success).toBe(false);
    expect(Ticket.safeParse({ ...base, status_version: -1 }).success).toBe(false);
  });
});
