/**
 * `GET /projects/:slug/stats` and `GET /projects/:slug/cost` against in-memory storage.
 *
 * Why: Home and Cost are read as facts. A leaky project filter would show another team's
 *   spend, a range that is ignored would draw the wrong window, spend invented for runs that
 *   recorded none would mislead, and an open read would expose every project's numbers.
 *
 * Pins: counts by state, throughput and runs per day, G1 rate, spend only from recorded
 *   cost with coverage, budgets from settings, range handling (default 30d, 400 on bad),
 *   404 unknown project, 401, project isolation.
 * Depends on: helpers/read-rig. IO: a loopback socket.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeRun, makeTicket, startReadRig } from '#tests/helpers/read-rig.js';
import type { ReadRig } from '#tests/helpers/read-rig.js';

let t: ReadRig;

const get = (path: string) => t.rig.json('GET', path);

beforeEach(async () => {
  t = await startReadRig();
  await t.storage.transaction(async (tx) => {
    await tx.tickets.insert(
      makeTicket('FX', 1, { status: 'done', updated_at: '2026-10-15T10:00:00.000Z' }),
    );

    await tx.tickets.insert(makeTicket('FX', 2, { status: 'review', rework_count: 1 }));
    await tx.tickets.insert(makeTicket('OT', 1, { status: 'done' }));
    await tx.runs.insert(
      makeRun('r1', 'FX-1', {
        cost_usd: 2,
        usage: {
          in: 10,
          out: 5,
          cachedIn: 0,
          cacheWrite: 0,
          byModel: { m: { in: 10, out: 5, cachedIn: 0, cacheWrite: 0 } },
        },
      }),
    );

    await tx.runs.insert(makeRun('r2', 'FX-2', { status: 'running', harness: 'codex' }));
    await tx.runs.insert(makeRun('r3', 'OT-1', { cost_usd: 99 }));
    await tx.gateResults.insert({
      run_id: 'r1',
      gate: 'G1',
      status: 'passed',
      started_at: '2026-10-16T02:00:00.000Z',
    });
  });
});

afterEach(async () => {
  await t.close();
});

describe('GET /projects/:slug/stats', () => {
  it('computes the project figures and defaults to 30 days', async () => {
    const res = await get('/projects/fixture/stats');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      range: '30d',
      project: 'fixture',
      tickets_by_state: { done: 1, review: 1, inbox: 0 },
      active_workers: 1,
      rework_rate: { hits: 1, total: 2, rate: 0.5 },
      gate_pass_rate: { hits: 1, total: 1, rate: 1 },
      cost_coverage: { runs_total: 2, runs_with_cost: 1 },
    });

    const body = res.body as {
      throughput: { date: string; value: number }[];
      spend_per_day: { value: number }[];
    };

    expect(body.throughput).toHaveLength(30);
    expect(body.throughput.find((p) => p.date === '2026-10-15')?.value).toBe(1);
    expect(body.spend_per_day.at(-1)?.value).toBe(2);
  });

  it('honours the range and rejects an unknown one', async () => {
    const seven = (await get('/projects/fixture/stats?range=7d')).body as {
      throughput: unknown[];
    };

    expect(seven.throughput).toHaveLength(7);
    expect((await get('/projects/fixture/stats?range=1y')).status).toBe(400);
  });

  it('keeps projects apart, 404s an unknown one and needs the token', async () => {
    const other = await get('/projects/other/stats');

    expect(other.body).toMatchObject({
      tickets_by_state: { done: 1 },
      cost_coverage: { runs_total: 1 },
    });

    expect((await get('/projects/nope/stats')).status).toBe(404);

    const open = await t.rig.json('GET', '/projects/fixture/stats', undefined, {
      authorization: '',
    });

    expect(open.status).toBe(401);
  });
});

describe('GET /projects/:slug/cost', () => {
  it('adds up recorded cost and tokens and returns the budgets settings hold', async () => {
    const res = await get('/projects/fixture/cost?range=7d');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      project: 'fixture',
      total_usd: 2,
      runs_total: 2,
      runs_with_cost: 1,
      tokens: { in: 10, out: 5 },
      by_ticket: [
        { ticket_id: 'FX-1', title: 'Ticket 1', cost_usd: 2 },
        { ticket_id: 'FX-2', cost_usd: 0 },
      ],
      by_harness: [
        { harness: 'claude', cost_usd: 2 },
        { harness: 'codex', cost_usd: 0 },
      ],
      by_model: [{ model: 'm' }],
      budgets: { period_usd: null },
    });

    const body = res.body as { per_day: unknown[]; budgets: { run_max_usd: number } };

    expect(body.per_day).toHaveLength(7);
    expect(body.budgets.run_max_usd).toBeGreaterThan(0);
  });

  it('404s an unknown project, 400s a bad range and needs the token', async () => {
    expect((await get('/projects/nope/cost')).status).toBe(404);
    expect((await get('/projects/fixture/cost?range=forever')).status).toBe(400);

    const open = await t.rig.json('GET', '/projects/fixture/cost', undefined, {
      authorization: '',
    });

    expect(open.status).toBe(401);
  });
});
