/**
 * `GET /projects/:slug/tickets` filters, sort orders, offset paging and totals.
 *
 * Why: the Tickets page lists every ticket of a project and lets the owner narrow, search and
 *   re-rank it. A filter that leaks another card's or project's tickets, a total that counts
 *   the page instead of the matches, an offset that repeats rows or a cost order that ignores
 *   a ticket's runs would send the owner to the wrong ticket or hide where the money went.
 *
 * Pins: lane, card and q filters (and their 400s), sort by updated / created / cost, offset
 *   paging with `total`, `cost_usd` and `card_title` on each row, the cursor and offset
 *   not mixing, and project isolation.
 * Depends on: helpers/card-rig, vitest. IO: a loopback socket.
 */

import type { Run } from '@forge/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { at, card, startCardRig, ticket } from '#tests/helpers/card-rig.js';
import type { CardRig } from '#tests/helpers/card-rig.js';

let ctx: CardRig;

const get = (path: string) => ctx.rig.json('GET', path);

interface Page {
  items: {
    id: string;
    card_id?: string;
    card_title?: string;
    cost_usd?: number;
    lane: string;
  }[];
  total?: number;
  nextCursor: string | null;
}

const run = (id: string, ticketId: string, cost?: number): Run => ({
  id,
  ticket_id: ticketId,
  harness: 'claude',
  driver_version: '1',
  cwd: '/w',
  lane: 'express',
  started_at: at(1),
  status: 'success',
  owner: 'srv-test',
  ...(cost === undefined ? {} : { cost_usd: cost }),
});

const ids = (page: Page) => page.items.map((i) => i.id);

beforeEach(async () => {
  ctx = await startCardRig();
  await ctx.seed(
    [card(1, { title: 'Login work' }), card(2, { title: 'Billing work' })],
    [
      ticket(1, 1, {
        title: 'Fix login redirect',
        lane: 'express',
        updated_at: at(5),
        created_at: at(1),
      }),
      ticket(2, 1, {
        title: 'Add 100% coverage',
        lane: 'standard',
        updated_at: at(4),
        created_at: at(3),
      }),
      ticket(3, 2, {
        title: 'Invoice totals',
        lane: 'express',
        updated_at: at(9),
        created_at: at(2),
      }),
    ],
  );

  await ctx.storage.transaction(async (tx) => {
    await tx.runs.insert(run('a', 'FX-1', 0.5));
    await tx.runs.insert(run('b', 'FX-1', 0.25));
    await tx.runs.insert(run('c', 'FX-3', 2));
    await tx.runs.insert(run('d', 'FX-2'));
  });
});

afterEach(async () => {
  await ctx.rig.close();
});

describe('GET /projects/:slug/tickets filters', () => {
  it('carries cost_usd, card_title and the total on every page', async () => {
    const body = (await get('/projects/fixture/tickets')).body as Page;

    expect(body.total).toBe(3);
    expect(body.items.find((i) => i.id === 'FX-1')).toMatchObject({
      card_id: 'FX-C1',
      card_title: 'Login work',
      cost_usd: 0.75,
    });

    expect(body.items.find((i) => i.id === 'FX-2')?.cost_usd).toBe(0);
  });

  it('filters by lane and by card, and total follows the filter', async () => {
    const express = (await get('/projects/fixture/tickets?lane=express')).body as Page;
    const byCard = (await get('/projects/fixture/tickets?card=FX-C1')).body as Page;

    expect(ids(express).sort()).toEqual(['FX-1', 'FX-3']);
    expect(express.total).toBe(2);
    expect(ids(byCard).sort()).toEqual(['FX-1', 'FX-2']);
    expect(byCard.total).toBe(2);
  });

  it('searches id and title, case-insensitively, with % literal', async () => {
    const title = (await get('/projects/fixture/tickets?q=LOGIN')).body as Page;
    const id = (await get('/projects/fixture/tickets?q=fx-3')).body as Page;
    const percent = (await get('/projects/fixture/tickets?q=%25')).body as Page;
    const none = (await get('/projects/fixture/tickets?q=zzz')).body as Page;

    expect(ids(title)).toEqual(['FX-1']);
    expect(ids(id)).toEqual(['FX-3']);
    expect(ids(percent)).toEqual(['FX-2']);
    expect(none).toMatchObject({ items: [], total: 0, nextCursor: null });
  });

  it('combines state, lane, card and q', async () => {
    const none = (
      await get('/projects/fixture/tickets?card=FX-C1&lane=express&q=invoice')
    ).body as Page;

    const one = (
      await get('/projects/fixture/tickets?card=FX-C1&lane=express&state=inbox&q=fix')
    ).body as Page;

    expect(none.total).toBe(0);
    expect(ids(one)).toEqual(['FX-1']);
  });

  it('answers 400 for an unknown lane, sort or card id, a blank q and a bad offset', async () => {
    const bad = await Promise.all(
      ['lane=warp', 'sort=name', 'card=nope', 'q=%20', 'offset=-1', 'offset=x'].map((q) =>
        get(`/projects/fixture/tickets?${q}`),
      ),
    );

    expect(bad.map((r) => r.status)).toEqual([400, 400, 400, 400, 400, 400]);
    expect(JSON.stringify(bad[1]?.body)).toContain('sort');
  });

  it('never shows another project in a filtered list or its total', async () => {
    const other = (await get('/projects/other/tickets?q=ticket')).body as Page;

    expect(other).toMatchObject({ items: [], total: 0 });
  });
});

describe('GET /projects/:slug/tickets sort and offset paging', () => {
  it('sorts by updated (default), created and cost', async () => {
    const updated = (await get('/projects/fixture/tickets')).body as Page;
    const created = (await get('/projects/fixture/tickets?sort=created')).body as Page;
    const cost = (await get('/projects/fixture/tickets?sort=cost')).body as Page;

    expect(ids(updated)).toEqual(['FX-3', 'FX-1', 'FX-2']);
    expect(ids(created)).toEqual(['FX-2', 'FX-3', 'FX-1']);
    expect(ids(cost)).toEqual(['FX-3', 'FX-1', 'FX-2']);
  });

  it('pages a cost-sorted list by offset to the end, with total on every page', async () => {
    const first = (await get('/projects/fixture/tickets?sort=cost&limit=2')).body as Page;
    const second = (await get('/projects/fixture/tickets?sort=cost&limit=2&offset=2'))
      .body as Page;

    const past = (await get('/projects/fixture/tickets?sort=cost&limit=2&offset=9'))
      .body as Page;

    expect(ids(first)).toEqual(['FX-3', 'FX-1']);
    expect(ids(second)).toEqual(['FX-2']);
    expect([first.total, second.total, past.total]).toEqual([3, 3, 3]);
    expect(past.items).toEqual([]);
  });

  it('gives no cursor for sorts that page by offset and keeps the cursor for the default sort', async () => {
    const created = (await get('/projects/fixture/tickets?sort=created&limit=1'))
      .body as Page;

    const updated = (await get('/projects/fixture/tickets?limit=1')).body as Page;
    const next = (
      await get(
        `/projects/fixture/tickets?limit=1&cursor=${encodeURIComponent(updated.nextCursor ?? '')}`,
      )
    ).body as Page;

    expect(created.nextCursor).toBeNull();
    expect(updated.nextCursor).not.toBeNull();
    expect(ids(next)).toEqual(['FX-1']);
  });

  it('refuses a cursor combined with offset or a non-default sort', async () => {
    const cursor =
      ((await get('/projects/fixture/tickets?limit=1')).body as Page).nextCursor ?? '';

    const withOffset = await get(
      `/projects/fixture/tickets?cursor=${encodeURIComponent(cursor)}&offset=1`,
    );

    const withSort = await get(
      `/projects/fixture/tickets?cursor=${encodeURIComponent(cursor)}&sort=cost`,
    );

    expect(withOffset.status).toBe(400);
    expect(withSort.status).toBe(400);
    expect(withOffset.body).toMatchObject({ error: { code: 'invalid_query' } });
  });

  it('offset on the default sort skips rows without a cursor', async () => {
    const page = (await get('/projects/fixture/tickets?offset=1&limit=1')).body as Page;

    expect(ids(page)).toEqual(['FX-1']);
    expect(page.total).toBe(3);
    expect(page.nextCursor).toBeNull();
  });
});
