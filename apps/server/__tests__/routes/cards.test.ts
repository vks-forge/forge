/**
 * Card read routes against real in-memory storage.
 *
 * Why: the Board and the Card page are built from these calls. A column that is not rolled
 *   up from the tickets and questions shows a request in the wrong place, a leaky project
 *   filter shows one team's cards in another's board, a page boundary that repeats or skips
 *   a card makes the Board flicker, and an unauthenticated read would expose every request
 *   on the machine.
 *
 * Pins: the column and type filters, cursor paging
 *   without gaps (including a filter that skips most rows), 404 / 400 / 401 answers, the
 *   detail with linked tickets (card_id) and pending questions, history paging oldest first,
 *   the registry list, and `card_id` on the ticket list.
 * Depends on: helpers/card-rig, vitest. IO: a loopback socket.
 */

import type { CardId } from '@forge/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { at, card, question, startCardRig, ticket } from '#tests/helpers/card-rig.js';
import type { CardRig } from '#tests/helpers/card-rig.js';

let ctx: CardRig;

const seed: CardRig['seed'] = (cards, tickets) => ctx.seed(cards, tickets);
const get = (path: string) => ctx.rig.json('GET', path);

interface Page {
  items: { id: string; column: string; ticket_count: number; project: string }[];
  nextCursor: string | null;
}

beforeEach(async () => {
  ctx = await startCardRig();
});

afterEach(async () => {
  await ctx.rig.close();
});

describe('GET /projects/:slug/cards', () => {
  it('lets a pending question move a busy card to needs_you', async () => {
    await seed(
      [card(1, { phase: 'in_progress' })],
      [ticket(1, 1, { status: 'in_progress' })],
    );

    await ctx.storage.transaction((tx) => tx.interactions.insert(question('FX-1')));

    const body = (await get('/projects/fixture/cards?column=needs_you')).body as Page;

    expect(body.items.map((i) => i.id)).toEqual(['FX-C1']);
  });

  it('filters by column and by type, and keeps projects apart', async () => {
    await seed(
      [
        card(1, { type: 'discussion' }),
        card(2, { phase: 'in_progress' }),
        { ...card(3), project: 'other', id: 'OT-C3' as CardId },
      ],
      [ticket(2, 2, { status: 'planned' })],
    );

    const inProgress = (await get('/projects/fixture/cards?column=in_progress'))
      .body as Page;

    const talks = (await get('/projects/fixture/cards?type=discussion')).body as Page;
    const all = (await get('/projects/fixture/cards')).body as Page;

    expect(inProgress.items.map((i) => i.id)).toEqual(['FX-C2']);
    expect(talks.items.map((i) => i.id)).toEqual(['FX-C1']);
    expect(all.items.map((i) => i.id).sort()).toEqual(['FX-C1', 'FX-C2']);
  });

  it('pages every card once with the cursor, newest change first', async () => {
    await seed(
      Array.from({ length: 11 }, (_, i) => card(i + 1, { updated_at: at(i % 3) })),
    );

    const ids: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const query: string = cursor ? `&cursor=${encodeURIComponent(cursor)}` : '';
      const page = (await get(`/projects/fixture/cards?limit=4${query}`)).body as Page;
      ids.push(...page.items.map((i) => i.id));
      cursor = page.nextCursor;
      pages += 1;
    } while (cursor !== null && pages < 10);

    const all = (await get('/projects/fixture/cards')).body as Page;

    expect(pages).toBe(3);
    expect(new Set(ids).size).toBe(11);
    expect(ids).toEqual(all.items.map((i) => i.id));
  });

  it('pages a column filter without gaps when most cards do not match', async () => {
    const cards = Array.from({ length: 9 }, (_, i) => card(i + 1, { updated_at: at(i) }));
    await seed(
      cards,
      [1, 4, 7].map((n) => ticket(n, n, { status: 'review' })),
    );

    const first = (await get('/projects/fixture/cards?column=needs_you&limit=2'))
      .body as Page;

    const second = (
      await get(
        `/projects/fixture/cards?column=needs_you&limit=2&cursor=${encodeURIComponent(first.nextCursor ?? '')}`,
      )
    ).body as Page;

    expect(first.items.map((i) => i.id)).toEqual(['FX-C7', 'FX-C4']);
    expect(first.nextCursor).not.toBeNull();
    expect(second.items.map((i) => i.id)).toEqual(['FX-C1']);
    expect(second.nextCursor).toBeNull();
  });

  it('answers 404 for an unknown project and 400 for a bad column, limit or cursor', async () => {
    expect((await get('/projects/nope/cards')).status).toBe(404);
    expect((await get('/projects/fixture/cards?column=limbo')).status).toBe(400);
    expect((await get('/projects/fixture/cards?limit=0')).status).toBe(400);
    expect((await get('/projects/fixture/cards?limit=201')).status).toBe(400);
    expect((await get('/projects/fixture/cards?cursor=garbage')).status).toBe(400);
  });

  it('refuses a request without the install token', async () => {
    const res = await ctx.rig.json('GET', '/projects/fixture/cards', undefined, {
      authorization: '',
    });

    expect(res.status).toBe(401);
  });
});

describe('GET /cards/:id', () => {
  it('returns the card, its column, linked tickets with their card id and pending questions', async () => {
    await seed(
      [card(1), card(2)],
      [
        ticket(1, 1, { status: 'waiting_human' }),
        ticket(2, 1, { status: 'done' }),
        ticket(3, 2),
      ],
    );

    await ctx.storage.transaction((tx) => tx.interactions.insert(question('FX-1')));
    const res = await get('/cards/FX-C1');
    const body = res.body as {
      id: string;
      column: string;
      ticket_count: number;
      tickets_done: number;
      tickets: { id: string; card_id: string; needs_you: boolean }[];
      pending_interactions: { id: string }[];
    };

    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      id: 'FX-C1',
      column: 'needs_you',
      ticket_count: 2,
      tickets_done: 1,
    });

    expect(body.tickets.map((t) => [t.id, t.card_id])).toEqual([
      ['FX-1', 'FX-C1'],
      ['FX-2', 'FX-C1'],
    ]);

    expect(body.pending_interactions.map((i) => i.id)).toEqual(['int-FX-1']);
  });

  it('answers 404 for an unknown card and 400 for something that is not a card id', async () => {
    expect((await get('/cards/FX-C99')).status).toBe(404);
    expect((await get('/cards/FX-12')).status).toBe(400);
    expect((await get('/cards/nonsense')).status).toBe(400);
  });
});

describe('GET /cards/:id/events', () => {
  const log = (text: string, minute: number) =>
    ctx.storage.transaction((tx) =>
      tx.cardEvents.append('FX-C1' as CardId, {
        kind: 'note',
        at: at(minute),
        actor: { type: 'system', id: 's' },
        payload: { text },
      }),
    );

  it('pages the history oldest first, with a cursor that continues without repeats', async () => {
    await seed([card(1)]);
    for (const [i, text] of ['a', 'b', 'c', 'd', 'e'].entries()) {
      await log(text, i);
    }

    const first = (await get('/cards/FX-C1/events?limit=2')).body as {
      items: { seq: number }[];
      nextCursor: string | null;
    };

    const second = (
      await get(
        `/cards/FX-C1/events?limit=2&cursor=${encodeURIComponent(first.nextCursor ?? '')}`,
      )
    ).body as typeof first;

    const third = (
      await get(
        `/cards/FX-C1/events?limit=2&cursor=${encodeURIComponent(second.nextCursor ?? '')}`,
      )
    ).body as typeof first;

    expect(first.items.map((e) => e.seq)).toEqual([0, 1]);
    expect(second.items.map((e) => e.seq)).toEqual([2, 3]);
    expect(third.items.map((e) => e.seq)).toEqual([4]);
    expect(third.nextCursor).toBeNull();
  });

  it('answers 404 for an unknown card, 400 for a bad id, cursor or limit', async () => {
    await seed([card(1)]);

    expect((await get('/cards/FX-C9/events')).status).toBe(404);
    expect((await get('/cards/FX-9/events')).status).toBe(400);
    expect((await get('/cards/FX-C1/events?cursor=garbage')).status).toBe(400);
    expect((await get('/cards/FX-C1/events?limit=0')).status).toBe(400);
  });
});

describe('GET /card-types', () => {
  it('lists the registry in display order', async () => {
    const res = await get('/card-types');
    const body = res.body as { types: { name: string; tickets_on_intake: boolean }[] };

    expect(res.status).toBe(200);
    expect(body.types.map((t) => t.name)).toEqual([
      'discussion',
      'plan',
      'issue',
      'pr_issue',
    ]);

    expect(body.types.map((t) => t.tickets_on_intake)).toEqual([
      false,
      false,
      false,
      true,
    ]);
  });
});

describe('GET /projects/:slug/tickets', () => {
  it('carries the parent card id so a Board ticket card can link back', async () => {
    await seed([card(1)], [ticket(1, 1), { ...ticket(2, 1), card_id: undefined }]);

    const res = await get('/projects/fixture/tickets');
    const items = (res.body as { items: { id: string; card_id?: string }[] }).items;

    expect(items.find((i) => i.id === 'FX-1')?.card_id).toBe('FX-C1');
    expect(items.find((i) => i.id === 'FX-2')?.card_id).toBeUndefined();
  });
});
