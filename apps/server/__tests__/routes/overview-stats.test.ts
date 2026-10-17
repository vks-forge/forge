/**
 * `GET /stats/overview` against in-memory storage with two live projects and one archived.
 *
 * Why: the Overview sums money and waiting work across projects. A project's spend landing in
 *   another's series, an archived project counted when the owner did not ask for it, a bad
 *   range quietly defaulting, a typo'd project slug turning into an empty chart instead of
 *   being named, or an open read would each mislead the owner or leak numbers.
 *
 * Pins: sums across projects with the stacked series, spend only from recorded cost with
 *   coverage, group defaults per range, 12m and all ranges, project filter with `unknown`,
 *   archived excluded unless asked, needs-action items with their project, 400 on a bad range,
 *   group or archived flag (hour only with today, today only by the hour), today by the hour,
 *   401 without the token.
 * Depends on: helpers/read-rig. IO: a loopback socket.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { OverviewStats } from '@forge/core';
import { makeRun, makeTicket, startReadRig } from '#tests/helpers/read-rig.js';
import type { ReadRig } from '#tests/helpers/read-rig.js';

let t: ReadRig;

const get = (path: string) => t.rig.json('GET', path);
const stats = async (query = ''): Promise<OverviewStats> =>
  (await get(`/stats/overview${query}`)).body as OverviewStats;

beforeEach(async () => {
  t = await startReadRig();
  await t.storage.transaction(async (tx) => {
    await tx.projects.upsert({
      id: 'old',
      slug: 'old',
      prefix: 'OL',
      status: 'archived',
      ecosystems: [],
      harness_defaults: {},
      tier_c_globs: [],
    });

    await tx.tickets.insert(
      makeTicket('FX', 1, { status: 'done', updated_at: '2026-10-15T10:00:00.000Z' }),
    );

    await tx.tickets.insert(makeTicket('FX', 2, { status: 'review' }));
    await tx.tickets.insert(makeTicket('OT', 1, { status: 'in_progress' }));
    await tx.tickets.insert(
      makeTicket('FX', 9, { id: 'OL-1' as never, project: 'old', status: 'done' }),
    );

    await tx.runs.insert(makeRun('r1', 'FX-1', { cost_usd: 2 }));
    await tx.runs.insert(makeRun('r2', 'FX-2', { status: 'running', harness: 'codex' }));
    await tx.runs.insert(makeRun('r3', 'OT-1', { cost_usd: 5, lane: 'full' }));
    await tx.runs.insert(makeRun('r4', 'OL-1', { cost_usd: 100 }));
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

describe('GET /stats/overview', () => {
  it('sums the open projects, stacks spend per project and counts waiting work', async () => {
    const res = await get('/stats/overview?range=7d');

    expect(res.status).toBe(200);

    const body = res.body as OverviewStats;

    expect(body).toMatchObject({
      range: '7d',
      group: 'day',
      projects_included: ['fixture', 'other'],
      unknown: [],
      kpis: {
        spend_usd: 7,
        tickets_done: 1,
        tickets_in_progress: 1,
        waiting_on_you: 1,
        workers_running: 1,
        g1_pass_rate: { hits: 1, total: 1, rate: 1 },
      },
      cost_coverage: { runs_total: 3, runs_with_cost: 2 },
    });

    expect(body.buckets).toHaveLength(7);
    expect(
      body.spend_by_project.find((p) => p.project === 'fixture')?.values.at(-1),
    ).toBe(2);

    expect(body.spend_by_project.find((p) => p.project === 'other')?.values.at(-1)).toBe(
      5,
    );

    expect(body.attention).toMatchObject([{ project: 'fixture', ticket_id: 'FX-2' }]);
    expect(body.spend_by_lane).toEqual([
      { key: 'full', usd: 5 },
      { key: 'express', usd: 2 },
    ]);
  });

  it('leaves archived projects out unless asked, and then includes them', async () => {
    expect((await stats()).projects_included).not.toContain('old');

    const withOld = await stats('?archived=1');

    expect(withOld.projects_included).toContain('old');
    expect(withOld.kpis.spend_usd).toBe(107);
    expect(withOld.projects.find((p) => p.slug === 'old')?.status).toBe('archived');
  });

  it('filters to the named projects and lists unknown slugs', async () => {
    const body = await stats('?projects=other,ghost,nope');

    expect(body.projects_included).toEqual(['other']);
    expect(body.unknown).toEqual(['ghost', 'nope']);
    expect(body.kpis.spend_usd).toBe(5);
  });

  it('follows the range for grouping and lets group override it', async () => {
    expect((await stats('?range=90d')).group).toBe('week');

    const year = await stats('?range=12m');

    expect(year.group).toBe('month');
    expect(year.buckets.at(-1)).toBe('2026-10-01');

    const all = await stats('?range=all&group=week');

    expect(all.range).toBe('all');
    expect(all.group).toBe('week');
    expect(all.kpis.spend_prev_usd).toBeNull();
  });

  it('answers today by the hour from local midnight, whatever the machine zone', async () => {
    const today = await stats('?range=today');

    expect(today.range).toBe('today');
    expect(today.group).toBe('hour');
    expect(today.buckets.length).toBeGreaterThanOrEqual(1);
    expect(today.buckets.length).toBeLessThanOrEqual(25);
    expect(today.buckets[0]).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\.000Z$/);
    expect(today.kpis.spend_prev_usd).not.toBeNull();
    expect(Date.parse(today.to) - Date.parse(today.from)).toBeLessThan(25 * 3_600_000);
    expect((await stats('?range=today&group=hour')).group).toBe('hour');
  });

  it('answers 400 for a bad range, group or archived flag', async () => {
    expect((await get('/stats/overview?range=1y')).status).toBe(400);
    expect((await get('/stats/overview?group=hour')).status).toBe(400);
    expect((await get('/stats/overview?range=7d&group=hour')).status).toBe(400);
    expect((await get('/stats/overview?range=today&group=day')).status).toBe(400);
    expect((await get('/stats/overview?archived=yes')).status).toBe(400);
  });

  it('is well formed with every project filtered to nothing known', async () => {
    const body = await stats('?projects=ghost');

    expect(body.projects_included).toEqual([]);
    expect(body.unknown).toEqual(['ghost']);
    expect(body.kpis.spend_usd).toBe(0);
  });

  it('needs the token', async () => {
    const open = await t.rig.json('GET', '/stats/overview', undefined, {
      authorization: '',
    });

    expect(open.status).toBe(401);
  });
});
