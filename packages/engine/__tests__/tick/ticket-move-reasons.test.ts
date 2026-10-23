/**
 * Tests for the reason a ticket move writes on its card history.
 *
 * Why: the History tab explains "why did it move?". When the engine stores the reason with the
 *   status change, the page says it as fact; when it does not, the page has to infer. These tests
 *   pin the reasons the engine writes for the moves that used to carry none: a re-plan cancel, an
 *   owner or card-close cancel, a held ticket released, and a wait's own blocked reason.
 *
 * Pins: a plan's `reason` lands on the `ticket_state` event; a parked ticket's blocker still does;
 *   a move with neither writes no `reason` key; `cancelTicketsTx` writes its caller's reason.
 * Depends on: src/tick/ticket-moves, src/tick/ticket-cancel, @forge/db (in-memory storage), vitest.
 */

import type { Card, CardId, Ticket } from '@forge/core';
import { createMemoryStorage } from '@forge/db';
import { describe, expect, it } from 'vitest';
import { cancelTicketsTx } from '#/tick/ticket-cancel.js';
import { moveTicket } from '#/tick/ticket-moves.js';

const NOW = '2026-10-13T00:05:00.000Z';
const CARD = 'FG-C1' as CardId;

const card: Card = {
  id: CARD,
  project: 'forge',
  type: 'issue',
  title: 'c',
  summary: 's',
  source: { kind: 'chat', ref: 'm' },
  created_by: { type: 'user', id: 'u' },
  created_at: '2026-10-13T00:00:00.000Z',
  updated_at: '2026-10-13T00:00:00.000Z',
  phase: 'in_progress',
  phase_version: 0,
  needs_you: false,
  priority: 'normal',
  links: [],
};

const ticket = (status: Ticket['status']): Ticket => ({
  id: 'FG-1' as Ticket['id'],
  project: 'forge',
  card_id: CARD,
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

async function seeded(status: Ticket['status']) {
  const storage = createMemoryStorage();
  await storage.transaction(async (tx) => {
    await tx.cards.insert(card);
    await tx.tickets.insert(ticket(status));
  });

  return storage;
}

const stateEvents = (storage: ReturnType<typeof createMemoryStorage>) =>
  storage
    .transaction((tx) => tx.cardEvents.list(CARD, { order: 'asc', limit: 50 }))
    .then((all) => all.flatMap((e) => (e.kind === 'ticket_state' ? [e.payload] : [])));

describe('ticket_state reasons', () => {
  it("writes the plan's reason on the event", async () => {
    const storage = await seeded('planned');

    await moveTicket(storage, 'FG-1', NOW, () => ({
      events: [{ type: 'cancelled' }],
      reason: 'Replaced by a new plan',
    }));

    expect(await stateEvents(storage)).toEqual([
      {
        ticket_id: 'FG-1',
        from: 'planned',
        to: 'cancelled',
        reason: 'Replaced by a new plan',
      },
    ]);
  });

  it("keeps a parked ticket's blocker as the reason", async () => {
    const storage = await seeded('planned');

    await moveTicket(storage, 'FG-1', NOW, () => ({
      events: [{ type: 'parked', reason: 'pipeline_pending' }],
      fields: { blocked_reason: 'pipeline_pending' },
    }));

    expect((await stateEvents(storage))[0]?.reason).toBe('pipeline_pending');
  });

  it('writes no reason key when nothing says why', async () => {
    const storage = await seeded('planned');

    await moveTicket(storage, 'FG-1', NOW, () => ({ events: [{ type: 'dispatched' }] }));

    expect(await stateEvents(storage)).toEqual([
      { ticket_id: 'FG-1', from: 'planned', to: 'in_progress' },
    ]);
  });

  it('cancels with the caller reason, defaulting to the owner cancelling', async () => {
    const storage = await seeded('planned');
    await storage.transaction((tx) =>
      cancelTicketsTx(tx, ['FG-1'], NOW, 'The card was closed'),
    );

    const other = await seeded('planned');
    await other.transaction((tx) => cancelTicketsTx(tx, ['FG-1'], NOW));

    expect((await stateEvents(storage))[0]?.reason).toBe('The card was closed');
    expect((await stateEvents(other))[0]?.reason).toBe('You cancelled it');
  });
});
