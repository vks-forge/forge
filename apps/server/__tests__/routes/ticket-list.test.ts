/**
 * `GET /projects/:slug/tickets` against real in-memory storage.
 *
 * Why: the web Board builds its columns from this one call, so a wrong filter shows a card
 *   in the wrong column, a leaky project filter shows one team's work in another's board, a
 *   page boundary that repeats or skips a ticket makes cards flicker or vanish, and an
 *   unauthenticated read would expose every ticket title on the machine.
 *
 * Pins: state filter (repeated and comma lists), cursor paging without duplicates or gaps,
 *   the limit bounds, 404 unknown project, 400 bad state / limit / cursor, 401 without the
 *   install token, project isolation, and the card fields (needs_you, run status).
 * Depends on: src/routes/routes, helpers/http-rig, @forge/db (memory storage). IO: a loopback socket.
 */

import { createMemoryConfigSource, createMemoryStorage } from '@forge/db';
import type { Project, Run, StorageAdapter, Ticket } from '@forge/core';
import type { Engine } from '@forge/engine';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildRoutes } from '#/routes/routes.js';
import { stubHarnessDeps } from '#tests/helpers/harness-deps.js';
import { startHttp } from '#tests/helpers/http-rig.js';
import type { HttpRig } from '#tests/helpers/http-rig.js';
import { inertRouteExtras } from '#tests/helpers/route-extras.js';

const project = (slug: string, prefix: string): Project => ({
  id: slug,
  slug,
  prefix,
  status: 'ready',
  ecosystems: [],
  harness_defaults: {},
  tier_c_globs: [],
});

const at = (minute: number): string =>
  `2026-10-13T00:${String(minute).padStart(2, '0')}:00.000Z`;

const ticket = (prefix: string, n: number, over: Partial<Ticket> = {}): Ticket => ({
  id: `${prefix}-${n}` as Ticket['id'],
  project: prefix === 'FX' ? 'fixture' : 'other',
  title: `Ticket ${n}`,
  body: 'b',
  type: 'feat',
  lane: 'express',
  tier_predicted: 'A',
  status: 'inbox',
  status_version: 0,
  rework_count: 0,
  priority: 0,
  created_at: at(0),
  updated_at: at(n % 50),
  blocked_by: [],
  ...over,
});

const RUN: Run = {
  id: 'run-1',
  ticket_id: 'FX-1',
  harness: 'claude',
  driver_version: '1',
  cwd: '/tmp/x',
  lane: 'express',
  started_at: at(1),
  status: 'running',
  owner: 'srv-test',
};

let rig: HttpRig;
let storage: StorageAdapter;

const seed = (tickets: Ticket[]) =>
  storage.transaction(async (tx) => {
    for (const t of tickets) {
      await tx.tickets.insert(t);
    }
  });

const get = (path: string) => rig.json('GET', path);

interface Page {
  items: { id: string; state: string; needs_you: boolean; run_status?: string }[];
  nextCursor: string | null;
}

beforeEach(async () => {
  storage = createMemoryStorage();
  await storage.transaction(async (tx) => {
    await tx.projects.upsert(project('fixture', 'FX'));
    await tx.projects.upsert(project('other', 'OT'));
  });

  rig = await startHttp(
    buildRoutes({
      ...stubHarnessDeps(),
      engine: {
        explainWait: vi.fn(async () => null),
        reviewOf: vi.fn(async () => null),
        unservableProjects: vi.fn(() => new Map()),
      } as unknown as Engine,
      storage,
      config: createMemoryConfigSource(),
      ...inertRouteExtras(),
      hooks: { handle: vi.fn() },
      owner: 'srv-test',
      startedAt: 0,
      now: () => 5_000,
      http: { ssePollMs: 5, sseHeartbeatMs: 1000 },
      shutdown: new AbortController().signal,
    }),
  );
});

afterEach(async () => {
  await rig.close();
});

describe('GET /projects/:slug/tickets', () => {
  it('lists newest change first with the card fields', async () => {
    await seed([
      ticket('FX', 1, {
        status: 'in_progress',
        assignee_run_id: 'run-1',
        updated_at: at(9),
      }),
      ticket('FX', 2, { status: 'review', updated_at: at(3) }),
    ]);

    await storage.transaction((tx) => tx.runs.insert(RUN));
    const res = await get('/projects/fixture/tickets');
    const body = res.body as Page;

    expect(res.status).toBe(200);
    expect(body.items.map((i) => i.id)).toEqual(['FX-1', 'FX-2']);
    expect(body.items[0]).toMatchObject({
      state: 'in_progress',
      project: 'fixture',
      needs_you: false,
      run_id: 'run-1',
      run_status: 'running',
    });

    expect(body.items[1]).toMatchObject({ state: 'review', needs_you: true });
    expect(body.nextCursor).toBeNull();
  });

  it('filters by state, repeated or comma separated', async () => {
    await seed([
      ticket('FX', 1, { status: 'inbox' }),
      ticket('FX', 2, { status: 'planned' }),
      ticket('FX', 3, { status: 'done' }),
    ]);

    const repeated = (await get('/projects/fixture/tickets?state=inbox&state=done'))
      .body as Page;

    const comma = (await get('/projects/fixture/tickets?state=planned,done'))
      .body as Page;

    expect(repeated.items.map((i) => i.state).sort()).toEqual(['done', 'inbox']);
    expect(comma.items.map((i) => i.state).sort()).toEqual(['done', 'planned']);
  });

  it('pages through every ticket once with the cursor, no duplicates and no gaps', async () => {
    await seed(
      Array.from({ length: 11 }, (_, i) =>
        ticket('FX', i + 1, { updated_at: at(i % 3) }),
      ),
    );

    const ids: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const query: string = cursor ? `&cursor=${encodeURIComponent(cursor)}` : '';
      const res = await get(`/projects/fixture/tickets?limit=4${query}`);
      const page = res.body as Page;
      expect(res.status).toBe(200);
      ids.push(...page.items.map((i) => i.id));
      cursor = page.nextCursor;
      pages += 1;
    } while (cursor !== null && pages < 10);

    const all = (await get('/projects/fixture/tickets')).body as Page;

    expect(pages).toBe(3);
    expect(new Set(ids).size).toBe(11);
    expect(ids).toEqual(all.items.map((i) => i.id));
  });

  it('gives no next cursor when the last page is exactly full', async () => {
    await seed([ticket('FX', 1), ticket('FX', 2)]);

    const page = (await get('/projects/fixture/tickets?limit=2')).body as Page;

    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).toBeNull();
  });

  it('accepts the maximum limit and refuses one above it or below one', async () => {
    const max = await get('/projects/fixture/tickets?limit=500');
    const over = await get('/projects/fixture/tickets?limit=501');
    const zero = await get('/projects/fixture/tickets?limit=0');
    const junk = await get('/projects/fixture/tickets?limit=abc');

    expect(max.status).toBe(200);
    expect([over.status, zero.status, junk.status]).toEqual([400, 400, 400]);
    expect(JSON.stringify(over.body)).toContain('limit');
  });

  it('answers 404 for an unknown project', async () => {
    const res = await get('/projects/nope/tickets');

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: { code: 'project_not_found' } });
  });

  it('answers 400 for an unknown state, listing the field', async () => {
    const res = await get('/projects/fixture/tickets?state=inbox,bogus');

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('state');
  });

  it('answers 400 for a cursor this server did not issue', async () => {
    const res = await get('/projects/fixture/tickets?cursor=not-a-cursor');

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: { code: 'invalid_cursor' } });
  });

  it('answers 401 without the install token', async () => {
    const res = await rig.json('GET', '/projects/fixture/tickets', undefined, {
      authorization: '',
    });

    expect(res.status).toBe(401);
  });

  it('never shows another project tickets', async () => {
    await seed([ticket('FX', 1), ticket('OT', 1), ticket('OT', 2)]);

    const a = (await get('/projects/fixture/tickets')).body as Page;
    const b = (await get('/projects/other/tickets')).body as Page;

    expect(a.items.map((i) => i.id)).toEqual(['FX-1']);
    expect(b.items.map((i) => i.id).sort()).toEqual(['OT-1', 'OT-2']);
  });
});
