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
  priority: 0,
  created_at: '2026-10-13T00:00:00.000Z',
  updated_at: '2026-10-13T00:00:00.000Z',
  blocked_by: [],
};

describe('ticket schemas', () => {
  it('reads a row without a priority as 0 and keeps a raised or lowered one', () => {
    const { priority: _p, ...old } = base;
    void _p;

    expect(Ticket.parse(old).priority).toBe(0);
    expect(Ticket.parse({ ...base, priority: 5 }).priority).toBe(5);
    expect(Ticket.parse({ ...base, priority: -1 }).priority).toBe(-1);
    expect(Ticket.safeParse({ ...base, priority: 1.5 }).success).toBe(false);
  });

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

describe('Ticket batch C fields', () => {
  it('parses the nullable engine fields when present and when absent', () => {
    expect(Ticket.safeParse(base).success).toBe(true);
    const full = {
      ...base,
      assignee_run_id: 'run-1',
      branch: 'feat/SF-1-add-doctor-check',
      worktree: '.forge/data/worktrees/SF-1',
      checkout_run_id: 'run-1',
      epic_id: 'SF-9',
      created_by_intake: 12,
    };

    expect(Ticket.parse(full)).toMatchObject(full);
  });

  it('parses the PR link and rejects a non-positive PR number', () => {
    expect(
      Ticket.parse({ ...base, pr_number: 7, pr_url: 'https://h/pull/7' }),
    ).toMatchObject({ pr_number: 7 });

    expect(Ticket.safeParse({ ...base, pr_number: 0 }).success).toBe(false);
  });

  it('accepts parked_from verifying and rejects any other value', () => {
    expect(Ticket.parse({ ...base, parked_from: 'verifying' })).toMatchObject({
      parked_from: 'verifying',
    });

    expect(Ticket.safeParse({ ...base, parked_from: 'planned' }).success).toBe(false);
  });

  it('rejects a malformed epic id and a non-integer intake id', () => {
    expect(Ticket.safeParse({ ...base, epic_id: 'nope' }).success).toBe(false);
    expect(Ticket.safeParse({ ...base, created_by_intake: 1.5 }).success).toBe(false);
  });
});
