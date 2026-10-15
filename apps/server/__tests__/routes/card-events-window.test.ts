/**
 * `GET /cards/:id/events` windows: `after`, `before` and `order` for the chat UI.
 *
 * Why: the Card page polls the history every few seconds. Walking every page each time costs
 *   more as a card grows, so the page asks only for events newer than the last `seq` it
 *   holds (`after`), loads the newest N when it opens (`order=desc`) and pages older ones on
 *   demand (`before`). Each event carries its `seq` so the page can do that bookkeeping. The
 *   opaque cursor of the earlier contract must keep working.
 *
 * Pins: `after` returns only newer events oldest first; newest-N with `order=desc`; `before`
 *   alone is newest-first below it and its cursor continues older; nothing newer is an empty
 *   page; `seq` on every item; cursor with after/before and a bad `order` are 400.
 * Depends on: helpers/card-rig, vitest. IO: a loopback socket.
 */

import type { CardId } from '@forge/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { card, startCardRig } from '#tests/helpers/card-rig.js';
import type { CardRig } from '#tests/helpers/card-rig.js';

let ctx: CardRig;

interface Page {
  items: { seq: number }[];
  nextCursor: string | null;
}

const get = async (path: string) => ctx.rig.json('GET', path);
const seqs = async (path: string) =>
  ((await get(path)).body as Page).items.map((e) => e.seq);

beforeEach(async () => {
  ctx = await startCardRig();
  await ctx.seed([card(1)]);
  for (const text of ['a', 'b', 'c', 'd', 'e']) {
    await ctx.storage.transaction((tx) =>
      tx.cardEvents.append('FX-C1' as CardId, {
        kind: 'note',
        at: '2026-10-13T00:00:00.000Z',
        actor: { type: 'system', id: 's' },
        payload: { text },
      }),
    );
  }
});

afterEach(async () => {
  await ctx.rig.close();
});

describe('GET /cards/:id/events windows', () => {
  it('after=N returns only newer events, oldest first, and an empty page when none', async () => {
    expect(await seqs('/cards/FX-C1/events?after=2')).toEqual([3, 4]);
    expect(await seqs('/cards/FX-C1/events?after=4')).toEqual([]);
  });

  it('order=desc returns the newest N first', async () => {
    expect(await seqs('/cards/FX-C1/events?order=desc&limit=2')).toEqual([4, 3]);
  });

  it('before alone is the newest N below it, and its cursor continues older', async () => {
    const first = (await get('/cards/FX-C1/events?before=4&limit=2')).body as Page;

    expect(first.items.map((e) => e.seq)).toEqual([3, 2]);

    const next = (
      await get(
        `/cards/FX-C1/events?order=desc&limit=2&cursor=${encodeURIComponent(first.nextCursor ?? '')}`,
      )
    ).body as Page;

    expect(next.items.map((e) => e.seq)).toEqual([1, 0]);
    expect(next.nextCursor).toBeNull();
  });

  it('after and before together bound a window', async () => {
    expect(await seqs('/cards/FX-C1/events?after=0&before=4&order=asc')).toEqual([
      1, 2, 3,
    ]);

    expect(await seqs('/cards/FX-C1/events?after=0&before=4')).toEqual([3, 2, 1]);
  });

  it('exposes seq on every event', async () => {
    const page = (await get('/cards/FX-C1/events')).body as Page;

    expect(page.items.map((e) => e.seq)).toEqual([0, 1, 2, 3, 4]);
  });

  it('refuses a cursor with after or before, and a bad order or bound', async () => {
    const cursor = ((await get('/cards/FX-C1/events?limit=1')).body as Page).nextCursor;

    expect((await get(`/cards/FX-C1/events?cursor=${cursor}&after=1`)).status).toBe(400);
    expect((await get(`/cards/FX-C1/events?cursor=${cursor}&before=3`)).status).toBe(400);
    expect((await get('/cards/FX-C1/events?order=sideways')).status).toBe(400);
    expect((await get('/cards/FX-C1/events?after=-1')).status).toBe(400);
    expect((await get('/cards/FX-C1/events?before=x')).status).toBe(400);
  });
});
