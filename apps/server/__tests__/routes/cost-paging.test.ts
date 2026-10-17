/**
 * `GET /projects/:slug/cost` paging of "Top tickets" and "Top runs".
 *
 * Why: the Cost page shows two ranked tables and pages them from the server, so a project
 *   with hundreds of tickets does not ship them all or hide the tail. The first page must be
 *   exactly what the endpoint always answered (older clients keep working), later pages must
 *   continue the same ranking, and the totals must count the whole window so the page can
 *   say how many rows exist.
 *
 * Pins: default page is the old top 50 with totals; `ticket_limit` / `ticket_offset` and
 *   `run_limit` / `run_offset` page independently; an offset past the end is an empty page;
 *   limits outside 1..100 and negative offsets are 400; project isolation.
 * Depends on: helpers/read-rig. IO: a loopback socket.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeRun, makeTicket, startReadRig } from '#tests/helpers/read-rig.js';
import type { ReadRig } from '#tests/helpers/read-rig.js';

let t: ReadRig;

const get = (path: string) => t.rig.json('GET', path);

interface Cost {
  by_ticket: { ticket_id: string; cost_usd: number }[];
  by_ticket_total: number;
  by_run: { run_id: string }[];
  by_run_total: number;
  total_usd: number;
}

beforeEach(async () => {
  t = await startReadRig();
  await t.storage.transaction(async (tx) => {
    for (let n = 1; n <= 60; n += 1) {
      await tx.tickets.insert(makeTicket('FX', n));
      await tx.runs.insert(
        makeRun(`r${String(n).padStart(2, '0')}`, `FX-${n}`, { cost_usd: n }),
      );
    }

    await tx.tickets.insert(makeTicket('OT', 1));
    await tx.runs.insert(makeRun('other', 'OT-1', { cost_usd: 1000 }));
  });
});

afterEach(async () => {
  await t.close();
});

describe('GET /projects/:slug/cost paging', () => {
  it('returns the top 50 of each table by default, plus the full totals', async () => {
    const body = (await get('/projects/fixture/cost?range=7d')).body as Cost;

    expect(body.by_ticket).toHaveLength(50);
    expect(body.by_run).toHaveLength(50);
    expect(body.by_ticket[0]).toMatchObject({ ticket_id: 'FX-60', cost_usd: 60 });
    expect(body.by_ticket_total).toBe(60);
    expect(body.by_run_total).toBe(60);
    expect(body.total_usd).toBe(1830);
  });

  it('pages tickets and runs independently on the same ranking', async () => {
    const first = (await get('/projects/fixture/cost?range=7d')).body as Cost;
    const next = (
      await get(
        '/projects/fixture/cost?range=7d&ticket_offset=50&run_limit=5&run_offset=2',
      )
    ).body as Cost;

    expect(next.by_ticket.map((x) => x.ticket_id)).toEqual(
      Array.from({ length: 10 }, (_, i) => `FX-${10 - i}`),
    );

    expect(next.by_run).toHaveLength(5);
    expect(next.by_run[0]?.run_id).toBe(first.by_run[2]?.run_id);
    expect(next.by_ticket_total).toBe(60);
  });

  it('gives an empty page past the end and keeps the totals', async () => {
    const body = (
      await get('/projects/fixture/cost?range=7d&ticket_offset=500&run_offset=500')
    ).body as Cost;

    expect(body.by_ticket).toEqual([]);
    expect(body.by_run).toEqual([]);
    expect([body.by_ticket_total, body.by_run_total]).toEqual([60, 60]);
  });

  it('accepts limit 100 and refuses 0, 101, a negative offset and junk', async () => {
    const max = (await get('/projects/fixture/cost?range=7d&ticket_limit=100'))
      .body as Cost;

    const bad = await Promise.all(
      [
        'ticket_limit=0',
        'ticket_limit=101',
        'run_limit=0',
        'run_offset=-1',
        'ticket_offset=x',
      ].map((q) => get(`/projects/fixture/cost?${q}`)),
    );

    expect(max.by_ticket).toHaveLength(60);
    expect(bad.map((r) => r.status)).toEqual([400, 400, 400, 400, 400]);
  });

  it('never ranks another project rows', async () => {
    const body = (await get('/projects/other/cost?range=7d')).body as Cost;

    expect(body.by_ticket.map((x) => x.ticket_id)).toEqual(['OT-1']);
    expect(body.by_ticket_total).toBe(1);
  });
});
