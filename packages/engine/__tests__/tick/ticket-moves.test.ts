/**
 * Tests for how the engine parks a ticket for a human.
 *
 * Why: a ticket's history is what a human reads to understand what happened. Parking a
 * ticket that never ran must not leave a `dispatched` and an `asked` behind, because the
 * control room would then claim a Worker started and a question was posed when neither
 * happened. Parking is one honest `parked` event with the reason.
 *
 * Pins: parkPlan emits exactly one `parked` event from planned and in_progress, only sets
 *   a reason when already waiting_human, and refuses statuses with no path.
 * Depends on: src/tick/ticket-moves, @forge/core, vitest.
 */

import type { Ticket } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { parkPlan } from '#/tick/ticket-moves.js';

const ticket = (status: Ticket['status']): Ticket => ({
  id: 'FG-1' as Ticket['id'],
  project: 'forge',
  title: 't',
  body: 'b',
  type: 'fix',
  lane: 'express',
  tier_predicted: 'A',
  status,
  status_version: 1,
  rework_count: 0,
  created_at: '2026-10-13T00:00:00.000Z',
  updated_at: '2026-10-13T00:00:00.000Z',
  blocked_by: [],
});

describe('parkPlan', () => {
  it.each(['planned', 'in_progress'] as const)('uses one parked event from %s', (s) => {
    expect(parkPlan(ticket(s), 'why')?.events).toEqual([
      { type: 'parked', reason: 'why' },
    ]);
  });

  it('only records the reason when already waiting_human', () => {
    expect(parkPlan(ticket('waiting_human'), 'why')).toEqual({
      events: [],
      fields: { blocked_reason: 'why' },
    });
  });

  it('has no path from other statuses', () => {
    expect(parkPlan(ticket('done'), 'why')).toBeNull();
  });
});
