/**
 * Tests for the per-tick invariant check.
 *
 * Why: the rule that keeps the Director honest is "every open assigned ticket has a live
 *   run, a durable reason to wait, or a visible blocking status" (director-core.md §3). A
 *   ticket that breaks it is silently lost work, so the check is pinned on its own: which
 *   statuses it applies to, what counts as a reason, and that violations come back as data
 *   for the control room instead of being auto-repaired.
 *
 * Pins: in_progress needs an active run, a pending interaction or a pending wake;
 *   waiting_human needs a pending interaction or a blocked_reason; other statuses are exempt.
 * Depends on: src/domain/invariants, @forge/core (Ticket), vitest.
 */

import { transition } from '@forge/core';
import type { Run, Ticket } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { findViolations } from '#/domain/invariants.js';

const T = '2026-10-13T00:00:00.000Z';
const ticket = (id: string, over: Partial<Ticket>): Ticket => ({
  id: id as Ticket['id'],
  project: 'FG',
  title: 't',
  body: 'b',
  type: 'fix',
  lane: 'express',
  tier_predicted: 'A',
  status: 'in_progress',
  status_version: 1,
  rework_count: 0,
  created_at: T,
  updated_at: T,
  blocked_by: [],
  ...over,
});
const run = (id: string, over: Partial<Run> = {}): Run => ({
  id,
  ticket_id: 'FG-1',
  harness: 'fake',
  driver_version: '1',
  cwd: '/x',
  lane: 'express',
  started_at: T,
  status: 'running',
  owner: 'o',
  ...over,
});

const base = {
  runs: new Map<string, Run>(),
  pendingInteractionTickets: new Set<string>(),
  wakeTickets: new Set<string>(),
};

describe('findViolations', () => {
  it('flags an in_progress ticket with nothing to wait for', () => {
    const v = findViolations({
      ...base,
      tickets: [ticket('FG-1', { assignee_run_id: 'r1' })],
    });
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({
      ticketId: 'FG-1',
      rule: 'in_progress_without_reason_to_wait',
    });
  });

  it('accepts an active run, a pending interaction or a pending wake', () => {
    const t = ticket('FG-1', { assignee_run_id: 'r1' });
    expect(
      findViolations({ ...base, tickets: [t], runs: new Map([['r1', run('r1')]]) }),
    ).toEqual([]);
    expect(
      findViolations({
        ...base,
        tickets: [t],
        pendingInteractionTickets: new Set(['FG-1']),
      }),
    ).toEqual([]);
    expect(
      findViolations({ ...base, tickets: [t], wakeTickets: new Set(['FG-1']) }),
    ).toEqual([]);
  });

  it('does not accept an ended run as a live run', () => {
    const t = ticket('FG-1', { assignee_run_id: 'r1' });
    const ended = run('r1', { status: 'success', ended_at: T });
    expect(
      findViolations({ ...base, tickets: [t], runs: new Map([['r1', ended]]) }),
    ).toHaveLength(1);
  });

  it('flags waiting_human with neither an interaction nor a blocked_reason', () => {
    const bare = ticket('FG-2', { status: 'waiting_human' });
    expect(findViolations({ ...base, tickets: [bare] })[0]).toMatchObject({
      rule: 'waiting_human_without_reason',
    });
    const parked = ticket('FG-3', { status: 'waiting_human', blocked_reason: 'auth' });
    expect(findViolations({ ...base, tickets: [parked] })).toEqual([]);
  });

  it('accepts a ticket parked by the engine (reason, no interaction) as visibly blocked', () => {
    const t = transition(ticket('FG-4', { status: 'planned' }), {
      type: 'parked',
      reason: 'lane not enabled in M0',
      at: T,
    });
    expect(t.ok).toBe(true);
    if (!t.ok) return;
    expect(t.value.status).toBe('waiting_human');
    expect(findViolations({ ...base, tickets: [t.value] })).toEqual([]);
  });

  it('exempts statuses that are not assigned work', () => {
    const others = (
      ['inbox', 'planned', 'blocked', 'verifying', 'review', 'done'] as const
    ).map((status, i) => ticket(`FG-${i + 10}`, { status }));
    expect(findViolations({ ...base, tickets: others })).toEqual([]);
  });
});
