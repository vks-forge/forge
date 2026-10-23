/**
 * Cost rollups on the card and ticket reads.
 *
 * Why: the owner reads what a request cost on the card header, the Board tile and the ticket
 *   page. If the card total left out the Director's own steps, counted another card's runs,
 *   or priced a run that recorded nothing, the figure would mislead; and if the Board list
 *   asked storage once per card the Board would slow with every card added.
 *
 * Pins: `GET /cards/:id` cost split (Director from planning spend, tickets from runs, total,
 *   by_ticket highest first); the card list carries `cost_usd` per card in the same totals;
 *   `GET /tickets/:id` cost with a per-run line and the `recorded` flag; zero for work with
 *   no runs; 404 for an unknown card or ticket; costs never cross cards.
 * Depends on: helpers/card-rig, vitest. IO: a loopback socket.
 */

import type { CardId, Run } from '@forge/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { at, card, startCardRig, ticket } from '#tests/helpers/card-rig.js';
import type { CardRig } from '#tests/helpers/card-rig.js';

let ctx: CardRig;

const get = (path: string) => ctx.rig.json('GET', path);

const run = (id: string, ticketId: string, over: Partial<Run> = {}): Run => ({
  id,
  ticket_id: ticketId,
  harness: 'claude',
  driver_version: '1',
  cwd: '/w',
  lane: 'express',
  started_at: at(1),
  status: 'success',
  owner: 'srv-test',
  ...over,
});

/** Writes the Director spend the engine keeps on the card's planning state. */
async function directorSpent(cardId: CardId, usd: number): Promise<void> {
  await ctx.storage.transaction(async (tx) => {
    const planning = await tx.cardPlanning.get(cardId);
    await tx.cardPlanning.update(cardId, {
      grill: { ...planning.grill, director_spend_usd: usd },
    });
  });
}

beforeEach(async () => {
  ctx = await startCardRig();
  await ctx.seed(
    [card(1), card(2), card(3)],
    [
      ticket(1, 1, { title: 'Alpha' }),
      ticket(2, 1, { title: 'Beta' }),
      ticket(3, 2, { title: 'Gamma' }),
    ],
  );

  await ctx.storage.transaction(async (tx) => {
    await tx.runs.insert(run('a', 'FX-1', { cost_usd: 0.25 }));
    await tx.runs.insert(run('b', 'FX-1', { cost_usd: 0.5, started_at: at(2) }));
    await tx.runs.insert(run('c', 'FX-2', { cost_usd: 1, status: 'error' }));
    await tx.runs.insert(run('d', 'FX-2', { started_at: at(3) }));
    await tx.runs.insert(run('e', 'FX-3', { cost_usd: 8 }));
  });

  await directorSpent('FX-C1' as CardId, 0.4);
});

afterEach(async () => {
  await ctx.rig.close();
});

describe('GET /cards/:id cost', () => {
  it('splits Director and ticket spend, totals them and lists tickets highest first', async () => {
    const res = await get('/cards/FX-C1');

    expect(res.status).toBe(200);
    const body = res.body as { cost_usd: number; cost: Record<string, unknown> };

    expect(body.cost).toEqual({
      director_usd: 0.4,
      tickets_usd: 1.75,
      total_usd: 2.15,
      by_ticket: [
        { ticket_id: 'FX-2', title: 'Beta', usd: 1 },
        { ticket_id: 'FX-1', title: 'Alpha', usd: 0.75 },
      ],
    });

    expect(body.cost_usd).toBeCloseTo(2.15);
  });

  it('is all zeros for a card with no tickets and no Director spend', async () => {
    const body = (await get('/cards/FX-C3')).body as { cost_usd: number; cost: unknown };

    expect(body.cost).toEqual({
      director_usd: 0,
      tickets_usd: 0,
      total_usd: 0,
      by_ticket: [],
    });

    expect(body.cost_usd).toBe(0);
  });

  it('counts only the card own tickets', async () => {
    const body = (await get('/cards/FX-C2')).body as { cost: { total_usd: number } };

    expect(body.cost.total_usd).toBe(8);
  });

  it('answers 404 for an unknown card and 400 for a malformed id', async () => {
    expect((await get('/cards/FX-C99')).status).toBe(404);
    expect((await get('/cards/nope')).status).toBe(400);
  });
});

describe('card list cost_usd', () => {
  it('carries the same total per card, Director spend included', async () => {
    const page = (await get('/projects/fixture/cards')).body as {
      items: { id: string; cost_usd: number }[];
    };

    const by = Object.fromEntries(page.items.map((c) => [c.id, c.cost_usd]));

    expect(by['FX-C1']).toBeCloseTo(2.15);
    expect(by['FX-C2']).toBe(8);
    expect(by['FX-C3']).toBe(0);
  });
});

describe('GET /tickets/:id cost', () => {
  it('lists each run oldest first, flags a run with no recorded cost and sums the rest', async () => {
    const res = await get('/tickets/FX-2');

    expect(res.status).toBe(200);
    expect((res.body as { cost: unknown }).cost).toEqual({
      total_usd: 1,
      workers_usd: 1,
      director_usd: 0,
      by_run: [
        { run_id: 'c', usd: 1, status: 'error', started_at: at(1), recorded: true },
        { run_id: 'd', usd: 0, status: 'success', started_at: at(3), recorded: false },
      ],
    });
  });

  it('is zero for a ticket with no runs', async () => {
    await ctx.seed([], [ticket(9, 3)]);

    const body = (await get('/tickets/FX-9')).body as { cost: unknown };

    expect(body.cost).toEqual({
      total_usd: 0,
      workers_usd: 0,
      director_usd: 0,
      by_run: [],
    });
  });

  it('answers 404 for an unknown ticket', async () => {
    expect((await get('/tickets/FX-404')).status).toBe(404);
  });
});

describe('ticket list cost_usd', () => {
  it('carries each ticket total from one grouped read', async () => {
    const page = (await get('/projects/fixture/tickets')).body as {
      items: { id: string; cost_usd: number }[];
    };

    const by = Object.fromEntries(page.items.map((t) => [t.id, t.cost_usd]));

    expect(by).toEqual({ 'FX-1': 0.75, 'FX-2': 1, 'FX-3': 8 });
  });
});
