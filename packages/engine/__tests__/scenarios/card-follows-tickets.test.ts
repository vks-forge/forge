/**
 * Scenario: a card's phase follows its tickets, forward and back, in every case.
 *
 * Why: card DCP-C2 sat in the Board's Done column while its tickets DCP-6 and DCP-7 (filed by
 *   the card chat after the card finished) were still open, and nobody was told the owner had
 *   to act. The card only ever followed its tickets forward, and data written before the
 *   reopen move existed was never repaired. The Board and the owner trust the card phase, so it
 *   must agree with the tickets whatever path wrote them, and a start-up sweep must repair
 *   cards that already disagree.
 *
 * Pins: new work on a done card reopens it; an unfinished ticket on a done card reopens it on
 *   the next tick (with a note) and flags the owner when a ticket waits on them; finishing that
 *   ticket completes the card again and clears the flag; an in-progress card whose tickets are
 *   all done completes; an approved card with a started ticket runs; all tickets cancelled
 *   leaves the card flagged for the owner, while done plus cancelled completes; earlier done
 *   tickets never start an approved card; the sweep is idempotent.
 * Depends on: helpers/rig, helpers/card-chat, src/tick/card-phase, src/tick/ticket-insert,
 *   src/tick/ticket-moves, vitest.
 */

import type { Card, CardId, CardPhase, Ticket, TicketStatus } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { moveCardTx, syncCardWithTickets } from '#/tick/card-phase.js';
import { insertInboxTicket } from '#/tick/ticket-insert.js';
import { moveTicket } from '#/tick/ticket-moves.js';
import { C1, card, history } from '#tests/helpers/card-chat.js';
import type { Rig } from '#tests/helpers/rig.js';
import { makeRig } from '#tests/helpers/rig.js';

const NOW = '2026-10-16T00:00:00.000Z';

/** Writes `phase` straight to storage: the state legacy data is in, with no sync. */
async function setPhase(rig: Rig, phase: CardPhase, needsYou = false): Promise<void> {
  await rig.storage.transaction(async (tx) => {
    const c = (await tx.cards.get(C1)) as Card;
    await tx.cards.updatePhase(C1, c.phase_version, {
      phase,
      needs_you: needsYou,
      updated_at: NOW,
    });
  });
}

/** Writes a ticket status straight to storage, bypassing the one door, like pre-fix data. */
async function setStatus(rig: Rig, id: string, status: TicketStatus): Promise<void> {
  await rig.storage.transaction(async (tx) => {
    const t = (await tx.tickets.get(id as Ticket['id'])) as Ticket;
    await tx.tickets.updateTicketCas(t.id, t.status_version, { status });
  });
}

/** Adds a raw ticket under the card (no card move), as the old insert did. */
async function addRaw(rig: Rig, id: string, status: TicketStatus): Promise<void> {
  await rig.storage.transaction(async (tx) => {
    const base = (await tx.tickets.listByCard(C1))[0] as Ticket;
    await tx.tickets.insert({
      ...base,
      id: id as Ticket['id'],
      status,
      status_version: 0,
    });
  });
}

/** A card with one ticket FG-1 (inbox), as `request` makes it. */
async function cardWithTicket(): Promise<Rig> {
  const rig = await makeRig();
  await rig.request('Fix it');

  return rig;
}

const phaseOf = async (rig: Rig): Promise<{ phase: CardPhase; needs_you: boolean }> => {
  const c = (await card(rig)) as Card;

  return { phase: c.phase, needs_you: c.needs_you };
};

const notes = async (rig: Rig): Promise<string[]> =>
  (await history(rig))
    .flatMap((e) => (e.kind === 'note' ? [e.payload.text] : []))
    .filter((t) => t.startsWith('Reopened') || t.startsWith('Finished'));

describe('card follows tickets: the live DCP-C2 case', () => {
  it('reopens a done card with an unfinished ticket, flags the owner, and completes with the ticket', async () => {
    const rig = await cardWithTicket();
    await setStatus(rig, 'FG-1', 'done');
    await addRaw(rig, 'FG-2', 'review');
    await setPhase(rig, 'done');

    await rig.tick();

    expect(await phaseOf(rig)).toEqual({ phase: 'in_progress', needs_you: true });
    expect(await notes(rig)).toEqual(['Reopened: FG-2 is not finished.']);

    await moveTicket(rig.storage, 'FG-2', NOW, () => ({ events: [{ type: 'done' }] }));

    expect(await phaseOf(rig)).toEqual({ phase: 'done', needs_you: false });
  });

  it('is idempotent: another tick changes nothing and writes no second note', async () => {
    const rig = await cardWithTicket();
    await setStatus(rig, 'FG-1', 'done');
    await addRaw(rig, 'FG-2', 'review');
    await setPhase(rig, 'done');
    await rig.tick();
    const before = await card(rig);

    await rig.tick();

    expect((await card(rig))?.phase_version).toBe(before?.phase_version);
    expect(await notes(rig)).toHaveLength(1);
  });
});

describe('card follows tickets: new work', () => {
  it('reopens a done card when any path inserts a ticket', async () => {
    const rig = await cardWithTicket();
    await setStatus(rig, 'FG-1', 'done');
    await setPhase(rig, 'done');

    await rig.storage.transaction(async (tx) => {
      const project = await tx.projects.get('forge');
      await insertInboxTicket(tx, project!, {
        cardId: C1,
        title: 'More',
        body: 'More work',
        type: 'feat',
        at: NOW,
        actor: { type: 'director', id: 'engine' },
      });
    });

    expect((await phaseOf(rig)).phase).toBe('in_progress');
  });

  it('moves a done card back when a done ticket is the only one and a live one is not done', async () => {
    const rig = await cardWithTicket();
    await setPhase(rig, 'done');

    await rig.storage.transaction((tx) => syncCardWithTickets(tx, C1, NOW));

    expect((await phaseOf(rig)).phase).toBe('in_progress');
  });
});

describe('card follows tickets: the sweep', () => {
  it('completes an in-progress card whose live tickets are all done', async () => {
    const rig = await cardWithTicket();
    await setStatus(rig, 'FG-1', 'done');
    await setPhase(rig, 'in_progress');

    await rig.tick();

    expect((await phaseOf(rig)).phase).toBe('done');
  });

  it('starts an approved card whose ticket is past the inbox', async () => {
    const rig = await cardWithTicket();
    await setStatus(rig, 'FG-1', 'in_progress');
    await setPhase(rig, 'approved');

    await rig.tick();

    expect((await phaseOf(rig)).phase).toBe('in_progress');
  });

  it('does not start an approved card because of an earlier done ticket (a follow-up plan)', async () => {
    const rig = await cardWithTicket();
    await setStatus(rig, 'FG-1', 'done');
    await addRaw(rig, 'FG-2', 'inbox');
    await setPhase(rig, 'approved');

    await rig.storage.transaction((tx) => syncCardWithTickets(tx, C1, NOW));

    expect((await phaseOf(rig)).phase).toBe('approved');
  });
});

describe('card follows tickets: cancelled tickets', () => {
  it('flags the owner when every ticket was cancelled, instead of running silently', async () => {
    const rig = await cardWithTicket();
    await setPhase(rig, 'in_progress');

    await moveTicket(rig.storage, 'FG-1', NOW, () => ({
      events: [{ type: 'cancelled' }],
    }));

    expect(await phaseOf(rig)).toEqual({ phase: 'in_progress', needs_you: true });
  });

  it('completes when some tickets are done and the rest cancelled', async () => {
    const rig = await cardWithTicket();
    await setStatus(rig, 'FG-1', 'done');
    await addRaw(rig, 'FG-2', 'inbox');
    await setPhase(rig, 'in_progress');

    await moveTicket(rig.storage, 'FG-2', NOW, () => ({
      events: [{ type: 'cancelled' }],
    }));

    expect((await phaseOf(rig)).phase).toBe('done');
  });

  it('never flags a done card', async () => {
    const rig = await cardWithTicket();
    await setStatus(rig, 'FG-1', 'done');
    await setPhase(rig, 'done');

    await rig.tick();

    expect(await phaseOf(rig)).toEqual({ phase: 'done', needs_you: false });
  });
});

describe('card follows tickets: re-plan from done', () => {
  it('lets a done card go back to grilling', async () => {
    const rig = await cardWithTicket();
    await setStatus(rig, 'FG-1', 'done');
    await setPhase(rig, 'done');

    const moved = await rig.storage.transaction((tx) =>
      moveCardTx(tx, C1 as CardId, { type: 'regrill' }, NOW),
    );

    expect(moved.ok).toBe(true);
    expect((await phaseOf(rig)).phase).toBe('grilling');
  });
});
