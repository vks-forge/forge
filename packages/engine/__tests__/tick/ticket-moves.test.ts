/**
 * Tests for how the engine parks a ticket for a human.
 *
 * Why: a ticket's history is what a human reads to understand what happened. Parking a
 * ticket that never ran must not leave a `dispatched` and an `asked` behind, because the
 * control room would then claim a Worker started and a question was posed when neither
 * happened. Parking is one honest `parked` event with the reason.
 *
 * A move stamped with an older clock (a tick that began before the ticket was written, a Director
 * step that took minutes) must not make the ticket's history run backwards.
 *
 * Pins: parkPlan emits exactly one `parked` event from planned and in_progress, only sets
 *   a reason when already waiting_human, and refuses statuses with no path; a move never sets
 *   `updated_at` below the ticket's `created_at` or its last write, and uses a later stamp as given.
 * Depends on: src/tick/ticket-moves, @forge/core, @forge/db (in-memory storage), vitest.
 */

import type { Ticket } from '@forge/core';
import { createMemoryStorage } from '@forge/db';
import { describe, expect, it } from 'vitest';
import { moveTicket, parkPlan } from '#/tick/ticket-moves.js';

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
  priority: 0,
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

describe('moveTicket timestamps', () => {
  const seeded = async (updatedAt: string) => {
    const storage = createMemoryStorage();
    await storage.transaction((tx) =>
      tx.tickets.insert({ ...ticket('planned'), updated_at: updatedAt }),
    );

    return storage;
  };

  const move = (storage: ReturnType<typeof createMemoryStorage>, at: string) =>
    moveTicket(storage, 'FG-1', at, () => ({ events: [{ type: 'dispatched' }] }));

  it('never sets updated_at below created_at or the last write', async () => {
    const storage = await seeded('2026-10-13T00:05:00.000Z');

    const moved = await move(storage, '2026-10-12T23:00:00.000Z');

    expect(moved.ok && moved.ticket.updated_at).toBe('2026-10-13T00:05:00.000Z');
    const stored = await storage.transaction((tx) =>
      tx.tickets.get('FG-1' as Ticket['id']),
    );

    expect(stored?.updated_at).toBe('2026-10-13T00:05:00.000Z');
  });

  it('uses the stamp it is given when it is later', async () => {
    const storage = await seeded('2026-10-13T00:00:00.000Z');

    const moved = await move(storage, '2026-10-13T00:09:00.000Z');

    expect(moved.ok && moved.ticket.updated_at).toBe('2026-10-13T00:09:00.000Z');
  });
});
