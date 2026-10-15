/**
 * `GET /projects/:slug/runs`, `GET /runs` and `GET /runs/:id` against in-memory storage.
 *
 * Why: the Runs screen is how the owner spots a stuck or costly Worker. A leaky project
 *   filter shows one team's runs in another's table, a page boundary that repeats or skips a
 *   run makes rows flicker, a wrong "paused" flag hides a quota wait, and an open read would
 *   expose every run on the machine.
 *
 * Pins: row fields (ticket title, duration, tokens, cost, paused_harness), status filter,
 *   cursor paging, limit bounds, 404 project / run, 400 status / limit / cursor, 401, project
 *   isolation, the cross-project list and the detail with gates.
 * Depends on: helpers/read-rig. IO: a loopback socket.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeRun, makeTicket, startReadRig } from '#tests/helpers/read-rig.js';
import type { ReadRig } from '#tests/helpers/read-rig.js';

let t: ReadRig;

const get = (path: string) => t.rig.json('GET', path);

interface Page {
  items: Record<string, unknown>[];
  nextCursor: string | null;
}

beforeEach(async () => {
  t = await startReadRig();
  await t.storage.transaction(async (tx) => {
    await tx.tickets.insert(makeTicket('FX', 1));
    await tx.tickets.insert(makeTicket('OT', 1));
    await tx.runs.insert(
      makeRun('r1', 'FX-1', {
        started_at: '2026-10-16T01:00:00.000Z',
        ended_at: '2026-10-16T01:00:30.000Z',
        cost_usd: 0.5,
        usage: { in: 10, out: 5, cachedIn: 1, cacheWrite: 2 },
      }),
    );

    await tx.runs.insert(
      makeRun('r2', 'FX-1', {
        started_at: '2026-10-16T11:59:00.000Z',
        status: 'running',
      }),
    );

    await tx.runs.insert(
      makeRun('r3', 'OT-1', { started_at: '2026-10-16T03:00:00.000Z' }),
    );
  });
});

afterEach(async () => {
  await t.close();
});

describe('GET /projects/:slug/runs', () => {
  it('lists newest first with the row fields', async () => {
    const res = await get('/projects/fixture/runs');
    const page = res.body as Page;

    expect(res.status).toBe(200);
    expect(page.items.map((r) => r['id'])).toEqual(['r2', 'r1']);
    expect(page.items[0]).toMatchObject({
      ticket_title: 'Ticket 1',
      project: 'fixture',
      status: 'running',
      duration_ms: 60_000,
      generation: 1,
      paused_harness: false,
    });

    expect(page.items[1]).toMatchObject({
      duration_ms: 30_000,
      cost_usd: 0.5,
      tokens: { in: 10, out: 5, cached_in: 1, cache_write: 2 },
    });
  });

  it('flags a live run whose harness is parked until a quota reset', async () => {
    await t.storage.transaction((tx) =>
      tx.harnessState.upsert({
        harness_id: 'claude',
        paused_until: '2026-10-16T18:00:00.000Z',
        reason: 'quota',
        updated_at: '2026-10-16T10:00:00.000Z',
      }),
    );

    const page = (await get('/projects/fixture/runs')).body as Page;

    expect(page.items.map((r) => r['paused_harness'])).toEqual([true, false]);
  });

  it('filters by status (repeated and comma lists)', async () => {
    const one = (await get('/projects/fixture/runs?status=running')).body as Page;
    const both = (await get('/projects/fixture/runs?status=running,success'))
      .body as Page;

    expect(one.items.map((r) => r['id'])).toEqual(['r2']);
    expect(both.items).toHaveLength(2);
  });

  it('pages with a cursor without repeating or skipping', async () => {
    const first = (await get('/projects/fixture/runs?limit=1')).body as Page;
    const second = (
      await get(`/projects/fixture/runs?limit=1&cursor=${first.nextCursor}`)
    ).body as Page;

    expect(first.items.map((r) => r['id'])).toEqual(['r2']);
    expect(second.items.map((r) => r['id'])).toEqual(['r1']);
    expect(second.nextCursor).toBeNull();
  });

  it('never shows another project run', async () => {
    const page = (await get('/projects/other/runs')).body as Page;

    expect(page.items.map((r) => r['id'])).toEqual(['r3']);
  });

  it('answers 404 for an unknown project and 400 for bad parameters', async () => {
    expect((await get('/projects/nope/runs')).status).toBe(404);
    expect((await get('/projects/fixture/runs?status=bogus')).status).toBe(400);
    expect((await get('/projects/fixture/runs?limit=0')).status).toBe(400);
    expect((await get('/projects/fixture/runs?limit=201')).status).toBe(400);

    const cursor = await get('/projects/fixture/runs?cursor=garbage');

    expect(cursor.status).toBe(400);
    expect(cursor.body).toMatchObject({ error: { code: 'invalid_cursor' } });
  });

  it('answers 401 without the install token', async () => {
    const res = await t.rig.json('GET', '/projects/fixture/runs', undefined, {
      authorization: '',
    });

    expect(res.status).toBe(401);
  });
});

describe('GET /runs', () => {
  it('lists runs of every project', async () => {
    const page = (await get('/runs')).body as Page;

    expect(page.items.map((r) => r['id'])).toEqual(['r2', 'r3', 'r1']);
    expect(page.items[1]).toMatchObject({ project: 'other' });
  });
});

describe('GET /runs/:id', () => {
  it('returns the detail with the gate verdicts of that run only', async () => {
    await t.storage.transaction(async (tx) => {
      await tx.gateResults.insert({
        run_id: 'r1',
        gate: 'G1',
        status: 'failed',
        started_at: '2026-10-16T01:00:10.000Z',
      });

      await tx.gateResults.insert({
        run_id: 'r2',
        gate: 'G1',
        status: 'passed',
        started_at: '2026-10-16T11:59:10.000Z',
      });
    });

    const res = await get('/runs/r1');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: 'r1',
      cwd: '/tmp/x',
      owner: 'srv-test',
      gates: [{ run_id: 'r1', gate: 'G1', status: 'failed' }],
    });
  });

  it('answers 404 for an unknown run and 401 without the token', async () => {
    expect((await get('/runs/nope')).status).toBe(404);

    const res = await t.rig.json('GET', '/runs/r1', undefined, { authorization: '' });

    expect(res.status).toBe(401);
  });
});
