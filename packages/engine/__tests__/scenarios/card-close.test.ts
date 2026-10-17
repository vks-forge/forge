/**
 * Scenario: closing a card closes its work, and a closed card never asks the owner anything.
 *
 * Why: the owner closed card DCP-C1 but its ticket kept waiting with a lane-hold escalation, and
 *   "Run as Express" on it started Worker runs (and a model bill) for work the owner had dropped.
 *   Closing is the owner saying "stop"; every unfinished ticket must stop with it, its waits must
 *   close, a live run must be killed, and a server that starts with such a leftover (the live
 *   database had one) must clean it up by itself, once, with a note on the card.
 *
 * Pins: the start-up repair cancels the open tickets of an already-closed card and settles their
 *   escalations; it is idempotent (no second note); `closeCardWork` cancels live work and stops
 *   its run; no escalation is raised for a closed card (backfill and park); a reopened card does
 *   not revive cancelled tickets.
 * Depends on: helpers/planning-rig, helpers/escalation-rig, helpers/verify-rig, src/tick/card-phase, vitest.
 */

import type { CardId } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { moveCardTx } from '#/tick/card-phase.js';
import { cardEventsOf, pendingOf } from '#tests/helpers/escalation-rig.js';
import {
  cardOf,
  planUntilDecision,
  planningRig,
  scriptTodo,
  tickets,
  todoPlan,
} from '#tests/helpers/planning-rig.js';
import type { Rig } from '#tests/helpers/rig.js';
import { makeRig } from '#tests/helpers/rig.js';

const at = (rig: Rig): string => new Date(rig.clock.now()).toISOString();

/** What `PATCH /cards/:id` stores: the reason and the closed phase, and nothing about the tickets. */
async function closeInStorage(rig: Rig, card: CardId): Promise<void> {
  await rig.storage.transaction(async (tx) => {
    await tx.cards.update(card, { closed_reason: 'duplicate', updated_at: at(rig) });
    await moveCardTx(tx, card, { type: 'close' }, at(rig));
  });
}

async function heldCard() {
  const rig = await planningRig();
  const plan = todoPlan();
  (plan['tickets'] as { lane: string }[])[0]!.lane = 'full';
  scriptTodo(rig, { write_plan: [plan] });
  const card = await planUntilDecision(rig);
  const [t1, t2] = await tickets(rig, card);

  return { rig, card, t1: t1!, t2: t2! };
}

describe('card close: start-up repair', () => {
  it('cancels the open tickets of an already-closed card and settles their waits', async () => {
    const { rig, card, t1, t2 } = await heldCard();
    expect(t1.status).toBe('waiting_human');
    expect(await pendingOf(rig, t1.id, 'failure')).toHaveLength(1);
    await closeInStorage(rig, card);

    const engine = rig.restart('srv-b');
    await rig.tickOn(engine);

    expect((await rig.ticket(t1.id)).status).toBe('cancelled');
    expect((await rig.ticket(t2.id)).status).toBe('cancelled');
    expect(await pendingOf(rig, t1.id)).toHaveLength(0);

    const notes = (await cardEventsOf(rig, card, 'note')).filter((n) =>
      n.payload.text.includes('closed'),
    );

    expect(notes).toHaveLength(1);
    expect(notes[0]!.payload.text).toContain(t1.id);
  });

  it('is idempotent: a second start writes no second note and changes nothing', async () => {
    const { rig, card, t1 } = await heldCard();
    await closeInStorage(rig, card);
    await rig.tickOn(rig.restart('srv-b'));
    const before = (await cardEventsOf(rig, card, 'note')).length;

    await rig.tickOn(rig.restart('srv-c'));

    expect((await cardEventsOf(rig, card, 'note')).length).toBe(before);
    expect((await rig.ticket(t1.id)).status).toBe('cancelled');
  });

  it('never gives a ticket of a closed card an escalation (backfill)', async () => {
    const { rig, card, t1 } = await heldCard();
    // The owner's wait is gone (as after migration 0023, before its backfill ran).
    await rig.storage.transaction(async (tx) => {
      for (const row of await tx.interactions.listByTicket(t1.id)) {
        await tx.interactions.update(row.id, {
          status: 'cancelled',
          answered_at: at(rig),
        });
      }
    });

    await closeInStorage(rig, card);
    await rig.tickOn(rig.restart('srv-b'));

    expect(await pendingOf(rig, t1.id)).toHaveLength(0);
    expect(
      (await rig.storage.transaction((tx) => tx.interactions.listPending())).length,
    ).toBe(0);
  });

  it('does not revive cancelled tickets when the card is reopened', async () => {
    const { rig, card, t1 } = await heldCard();
    await closeInStorage(rig, card);
    await rig.tickOn(rig.restart('srv-b'));
    await rig.storage.transaction((tx) =>
      tx.cards.update(card, { closed_reason: undefined, updated_at: at(rig) }),
    );

    await rig.tickOn(rig.restart('srv-c'));

    expect((await rig.ticket(t1.id)).status).toBe('cancelled');
    expect((await cardOf(rig, card)).closed_reason).toBeUndefined();
  });
});

describe('card close: closing live work', () => {
  it('cancels a running ticket, stops its run and removes its worktree', async () => {
    const rig = await makeRig();
    const id = await rig.request('Fix the doctor check');
    await rig.tick();
    const running = await rig.ticket(id);
    expect(running.status).toBe('in_progress');
    const card = running.card_id!;
    await closeInStorage(rig, card);

    const cancelled = await rig.engine.closeCardWork(card);

    expect(cancelled).toEqual([id]);
    expect((await rig.ticket(id)).status).toBe('cancelled');
    expect(rig.driver.cancels).toContain('run-1');
    expect(rig.worktrees.removed.length).toBeGreaterThan(0);
  });

  it('does nothing for a card that is not closed', async () => {
    const rig = await makeRig();
    const id = await rig.request('Fix the doctor check');
    await rig.tick();

    expect(await rig.engine.closeCardWork((await rig.ticket(id)).card_id!)).toEqual([]);
    expect((await rig.ticket(id)).status).toBe('in_progress');
  });
});
