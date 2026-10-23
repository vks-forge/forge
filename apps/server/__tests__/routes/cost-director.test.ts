/**
 * Director spend on the Cost page, the Overview, the ticket page and the card budget row.
 *
 * Why: the owner saw $7.43 on Cost and $24.86 on the cards because the Director's own steps were only on
 *   the card. Every page now adds the Director's dated spend ledger to the Workers' runs and says how much
 *   was which, and the card's budget row names the cap in force (its own, the project's, or Forge's) so the
 *   page and the engine's warnings agree.
 *
 * Pins: the Cost total equals the sum of the card totals for the same cards (the eval mismatch) with the
 *   worker/director split and per-day split; the Overview spend includes Director rows dated in the range and
 *   leaves out older ones; a ticket's Director steps (with or without a card) show on `GET /tickets/:id`;
 *   the card detail budget is the card cap, else the project level, else the Forge default, with the
 *   source and the same spend the warning uses.
 * Depends on: helpers/card-rig, vitest. IO: a loopback socket.
 */

import type { CardId, Run } from '@forge/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { at, card, startCardRig, ticket } from '#tests/helpers/card-rig.js';
import type { CardRig } from '#tests/helpers/card-rig.js';

let ctx: CardRig;

const get = (path: string) => ctx.rig.json('GET', path);
const WHO = { author: 'owner', reason: 'tuning' };

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

/** One Director step the way the engine's `addDirectorSpend` writes it: a ledger row and the card's cached total. */
async function directorStep(
  usd: number,
  over: { card?: number; ticket?: string; when?: string } = {},
): Promise<void> {
  const cardId = over.card === undefined ? undefined : (`FX-C${over.card}` as CardId);
  await ctx.storage.transaction(async (tx) => {
    await tx.directorSpend.append({
      project: 'fixture',
      ...(cardId === undefined ? {} : { card_id: cardId }),
      ...(over.ticket === undefined ? {} : { ticket_id: over.ticket as never }),
      kind: 'card_chat',
      usd,
      recorded: true,
      at: over.when ?? at(5),
    });

    if (cardId !== undefined) {
      const planning = await tx.cardPlanning.get(cardId);
      await tx.cardPlanning.update(cardId, {
        grill: {
          ...planning.grill,
          director_spend_usd: planning.grill.director_spend_usd + usd,
        },
      });
    }
  });
}

beforeEach(async () => {
  ctx = await startCardRig();
  await ctx.seed(
    [card(1), card(2)],
    [ticket(1, 1, { title: 'Alpha' }), ticket(2, 2, { title: 'Beta' })],
  );

  await ctx.storage.transaction(async (tx) => {
    await tx.runs.insert(run('a', 'FX-1', { cost_usd: 3 }));
    await tx.runs.insert(run('b', 'FX-2', { cost_usd: 2 }));
  });

  await directorStep(4, { card: 1, ticket: 'FX-1' });
  await directorStep(3, { card: 2 });
});

afterEach(async () => {
  await ctx.rig.close();
});

type Cost = {
  total_usd: number;
  worker_usd: number;
  director_usd: number;
  director_steps_total: number;
  per_day: { date: string; value: number }[];
  per_day_split: { date: string; worker_usd: number; director_usd: number }[];
};

describe('GET /projects/:slug/cost', () => {
  it('totals Workers plus Director and equals the sum of the card totals', async () => {
    const cost = (await get('/projects/fixture/cost?range=7d')).body as Cost;
    const cards = (await get('/projects/fixture/cards')).body as {
      items: { cost_usd: number }[];
    };

    expect(cost.worker_usd).toBe(5);
    expect(cost.director_usd).toBe(7);
    expect(cost.total_usd).toBe(12);
    expect(cost.director_steps_total).toBe(2);
    expect(cards.items.reduce((sum, c) => sum + c.cost_usd, 0)).toBeCloseTo(
      cost.total_usd,
    );
  });

  it('splits each day so the two sources add up to the day', async () => {
    const cost = (await get('/projects/fixture/cost?range=7d')).body as Cost;

    const day = cost.per_day_split.find((d) => d.date === '2026-10-13');
    expect(day).toEqual({ date: '2026-10-13', worker_usd: 5, director_usd: 7 });
    for (const [i, p] of cost.per_day.entries()) {
      const s = cost.per_day_split[i];
      expect((s?.worker_usd ?? 0) + (s?.director_usd ?? 0)).toBeCloseTo(p.value);
    }
  });

  it('keeps another project out of the totals', async () => {
    await ctx.storage.transaction((tx) =>
      tx.directorSpend.append({
        project: 'other',
        kind: 'card_chat',
        usd: 100,
        recorded: true,
        at: at(5),
      }),
    );

    const cost = (await get('/projects/fixture/cost?range=7d')).body as Cost;

    expect(cost.director_usd).toBe(7);
  });
});

describe('GET /stats/overview', () => {
  it('adds Director rows dated in range and leaves older ones out', async () => {
    await directorStep(50, { card: 1, when: '2026-01-01T00:00:00.000Z' });

    const stats = (await get('/stats/overview?range=7d&projects=fixture')).body as {
      kpis: { spend_usd: number; spend_worker_usd: number; spend_director_usd: number };
    };

    expect(stats.kpis.spend_worker_usd).toBe(5);
    expect(stats.kpis.spend_director_usd).toBe(7);
    expect(stats.kpis.spend_usd).toBe(12);
  });
});

describe('GET /tickets/:id cost', () => {
  it('shows the Director steps on a ticket beside its runs', async () => {
    const body = (await get('/tickets/FX-1')).body as {
      cost: { total_usd: number; workers_usd: number; director_usd: number };
    };

    expect(body.cost).toMatchObject({ total_usd: 7, workers_usd: 3, director_usd: 4 });
  });

  it('counts a Director step on a ticket that belongs to no card', async () => {
    await ctx.seed([], [ticket(9, 1, { card_id: undefined })]);
    await directorStep(1.5, { ticket: 'FX-9' });

    const body = (await get('/tickets/FX-9')).body as { cost: { director_usd: number } };

    expect(body.cost.director_usd).toBe(1.5);
  });
});

describe('GET /cards/:id budget', () => {
  type Budget = { cap_usd: number | null; source: string; spent_usd: number };
  const budget = async (id: string): Promise<Budget> =>
    ((await get(`/cards/${id}`)).body as { budget: Budget }).budget;

  it('names the Forge default and the card total when the card has no cap', async () => {
    expect(await budget('FX-C1')).toEqual({ cap_usd: 5, source: 'forge', spent_usd: 7 });
  });

  it('prefers the project level over the Forge default', async () => {
    const put = await ctx.rig.json('PUT', '/settings/projects/fixture', {
      doc: { director: { budget_warning_usd: 12 } },
      expectedVersion: 0,
      ...WHO,
    });

    expect(put.status).toBe(200);
    expect(await budget('FX-C1')).toMatchObject({ cap_usd: 12, source: 'project' });
  });

  it('prefers the card own cap over both', async () => {
    await ctx.storage.transaction((tx) =>
      tx.cards.update('FX-C1' as CardId, { budget_cap_usd: 20, updated_at: at(9) }),
    );

    expect(await budget('FX-C1')).toMatchObject({ cap_usd: 20, source: 'card' });
  });
});
