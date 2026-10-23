/**
 * Where a ticket really is, and what counts as waiting on the owner, over the HTTP API.
 *
 * Why: the owner reads the Board, the Card page and the Needs-you counts to decide where to
 *   look. After they answer "Re-plan" the ticket keeps its waiting status while the card
 *   re-plans, so a count that trusts the status keeps asking for an answer nobody needs, and a
 *   reworked ticket behind a busy Worker slot reads In Progress. Each route must carry the
 *   engine's phase line, and every Needs-you view must count only open owner items.
 *
 * Pins: ticket list rows and card detail tickets carry `wait` and take `needs_you` from it; the
 *   ticket detail carries `wait`; a card with a waiting ticket and no open owner item is not
 *   Needs you (Board list and detail), and is once an owner item is open; the Inbox lists no
 *   item for a waiting ticket with none open; the act replies carry `next`.
 * Depends on: helpers/card-rig, vitest. IO: a loopback socket.
 */

import type { Interaction, TicketWait } from '@forge/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { card, question, startCardRig, ticket } from '#tests/helpers/card-rig.js';
import type { CardRig } from '#tests/helpers/card-rig.js';

let ctx: CardRig;
const explainWaits = vi.fn();
const actOnTicket = vi.fn();
const actOnEscalation = vi.fn();

const HELD: TicketWait = {
  phase: 'held_by_plan',
  text: 'You chose Re-plan: waiting for the new plan of FX-C1',
  card_id: 'FX-C1' as TicketWait['card_id'],
};

const QUEUED: TicketWait = {
  phase: 'queued',
  text: 'Waiting for a Worker slot (1 of 1 in use): FX-2 is working',
  holders: ['FX-2' as never],
};

async function start(): Promise<void> {
  ctx = await startCardRig({ explainWaits, actOnTicket, actOnEscalation });
  await ctx.seed(
    [card(1, { phase: 'in_progress' })],
    [
      ticket(1, 1, { status: 'waiting_human' }),
      ticket(3, 1, { status: 'in_progress', rework_count: 1 }),
    ],
  );
}

afterEach(async () => {
  await ctx.rig.close();
  explainWaits.mockReset();
  actOnTicket.mockReset();
  actOnEscalation.mockReset();
});

describe('wait on ticket rows', () => {
  it('puts the phase on list rows and counts Needs you only for an open owner item', async () => {
    explainWaits.mockResolvedValue(
      new Map([
        ['FX-1', HELD],
        ['FX-3', QUEUED],
      ]),
    );

    await start();
    const res = await ctx.rig.json('GET', '/projects/fixture/tickets');
    const items = (
      res.body as {
        items: { id: string; state: string; needs_you: boolean; wait?: TicketWait }[];
      }
    ).items;

    const byId = Object.fromEntries(items.map((i) => [i.id, i]));

    expect(byId['FX-1']).toMatchObject({
      state: 'waiting_human',
      needs_you: false,
      wait: HELD,
    });

    expect(byId['FX-3']).toMatchObject({
      state: 'in_progress',
      needs_you: false,
      wait: QUEUED,
    });

    expect(explainWaits).toHaveBeenCalledTimes(1);
  });

  it('puts the phase on the tickets of the card detail, and on the ticket detail', async () => {
    explainWaits.mockResolvedValue(
      new Map([
        ['FX-1', HELD],
        ['FX-3', QUEUED],
      ]),
    );

    await start();

    const card1 = await ctx.rig.json('GET', '/cards/FX-C1');
    const tickets = (card1.body as { tickets: { id: string; wait?: TicketWait }[] })
      .tickets;

    const detail = await ctx.rig.json('GET', '/tickets/FX-3');

    expect(tickets.find((t) => t.id === 'FX-3')?.wait).toEqual(QUEUED);
    expect(detail.body).toMatchObject({ wait: QUEUED });
  });
});

describe('Needs you counts only open owner items', () => {
  it('does not flag a card whose waiting ticket has no open owner item', async () => {
    explainWaits.mockResolvedValue(new Map());
    await start();

    const board = await ctx.rig.json('GET', '/projects/fixture/cards');
    const detail = await ctx.rig.json('GET', '/cards/FX-C1');
    const row = (
      board.body as { items: { id: string; needs_you: boolean; column: string }[] }
    ).items[0];

    expect(row).toMatchObject({ needs_you: false, column: 'in_progress' });
    expect(detail.body).toMatchObject({ needs_you: false, column: 'in_progress' });
  });

  it('flags the card once an owner item is open on the ticket', async () => {
    explainWaits.mockResolvedValue(new Map());
    await start();
    await ctx.storage.transaction((tx) => tx.interactions.insert(question('FX-1')));

    const board = await ctx.rig.json('GET', '/projects/fixture/cards');
    const row = (board.body as { items: { needs_you: boolean; column: string }[] })
      .items[0];

    expect(row).toMatchObject({ needs_you: true, column: 'needs_you' });
  });

  it('keeps a waiting ticket with no open item out of the Inbox and its count', async () => {
    explainWaits.mockResolvedValue(new Map());
    await start();

    const counts = await ctx.rig.json('GET', '/projects/fixture/inbox/counts');
    const list = await ctx.rig.json('GET', '/projects/fixture/inbox?view=all');

    expect(JSON.stringify(list.body)).not.toContain('ticket_waiting');
    expect(counts.body).toMatchObject({ needs_action: 0 });
  });
});

describe('the act replies say what happens next', () => {
  it('carries `next` from the same derivation on the ticket act and the interaction act', async () => {
    explainWaits.mockResolvedValue(new Map([['FX-3', QUEUED]]));
    await start();
    actOnTicket.mockResolvedValue({ status: 'done' });

    const res = await ctx.rig.json('POST', '/tickets/FX-3/act', {
      action: 'rework',
      comment: 'handle the empty case',
    });

    expect(res.body).toEqual({ ticket_id: 'FX-3', action: 'rework', next: QUEUED.text });

    const row: Interaction = { ...question('FX-3'), kind: 'question' };
    await ctx.storage.transaction((tx) => tx.interactions.insert(row));
    actOnEscalation.mockResolvedValue({ status: 'done', interaction: null });
    const viaInteraction = await ctx.rig.json('POST', `/interactions/${row.id}/act`, {
      action: 'answer',
      text: 'yes',
    });

    expect(viaInteraction.body).toMatchObject({ next: QUEUED.text });
  });
});
