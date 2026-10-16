/**
 * `POST /projects/:slug/cards` on the real engine door.
 *
 * Why: the create-card form replaces chat intake in the UI (d-0128, d-0138), and the web
 *   client keys its inline messages on exact status codes and error codes. A card that made a
 *   ticket, forgot the Director's reply, accepted a dependency loop or created twice on a
 *   double click would each break the flow the owner just asked for. The routes must also
 *   answer the contract's codes, and carry the loop in the error so the form can name it.
 *
 * Pins: 201 with the full card view (phase, flags, priority, links, dependencies, column), no
 *   ticket, first event and queued reply, tick requested; the same dedupe_key answers 200 with
 *   the first card; defaults; 400 `invalid_request` with issues; 404 `project_not_found` and
 *   `card_not_found`; 400 `cross_project_dependency`; 409 `dependency_cycle` with `cycle`;
 *   409 `project_archived`; 503 while draining; 401 without the token. The relations edit is
 *   pinned in card-relations.
 * Depends on: helpers/flow-rig, vitest. IO: a loopback socket.
 */

import type { CardId } from '@forge/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startFlowRig } from '#tests/helpers/flow-rig.js';
import type { FlowRig } from '#tests/helpers/flow-rig.js';

let ctx: FlowRig;

const body = (over: Record<string, unknown> = {}) => ({
  title: 'A todo application',
  description: 'Build a small todo application with a list and a form.',
  type: 'plan',
  priority: 'high',
  depends_on: [],
  blocks: [],
  links: ['https://example.com/spec'],
  dedupe_key: 'key-1',
  ...over,
});

const post = (over: Record<string, unknown> = {}, slug = 'fixture') =>
  ctx.rig.json('POST', `/projects/${slug}/cards`, body(over));

const make = async (key: string, over: Record<string, unknown> = {}): Promise<string> => {
  const res = await post({ dedupe_key: key, ...over });

  expect(res.status).toBe(201);

  return (res.body as { card: { id: string } }).card.id;
};

const errorOf = (res: { body: unknown }) =>
  (
    res.body as {
      error: { code: string; message: string; cycle?: string[]; issues?: unknown[] };
    }
  ).error;

beforeEach(async () => {
  ctx = await startFlowRig();
});

afterEach(async () => {
  await ctx.close();
});

describe('POST /projects/:slug/cards', () => {
  it('creates a card in grilling with the full view, no ticket, the first event and a queued reply', async () => {
    const res = await post();

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      card: expect.objectContaining({
        id: 'FX-C1',
        project: 'fixture',
        type: 'plan',
        title: 'A todo application',
        summary: 'Build a small todo application with a list and a form.',
        phase: 'grilling',
        phase_version: 0,
        needs_you: false,
        priority: 'high',
        links: ['https://example.com/spec'],
        depends_on: [],
        blocks: [],
        column: 'shaping',
        ticket_count: 0,
        tickets_done: 0,
        source: { kind: 'chat', ref: 'key-1' },
      }),
    });

    const id = 'FX-C1' as CardId;
    const tickets = await ctx.storage.transaction((tx) => tx.tickets.listByCard(id));
    const events = await ctx.storage.transaction((tx) =>
      tx.cardEvents.list(id, { limit: 10 }),
    );

    const queue = await ctx.storage.transaction((tx) => tx.cardReplyQueue.listOpen(id));

    expect(tickets).toEqual([]);
    expect(events).toMatchObject([
      {
        kind: 'user_message',
        payload: {
          text: 'A todo application\n\nBuild a small todo application with a list and a form.',
        },
      },
    ]);

    expect(queue).toMatchObject([{ reason: 'card_created' }]);
    expect(ctx.tickRequests.count).toBe(1);
  });

  it('shows the new card on the Board list and its detail with the same fields', async () => {
    await post();

    const list = await ctx.rig.json('GET', '/projects/fixture/cards');
    const detail = await ctx.rig.json('GET', '/cards/FX-C1');

    expect((list.body as { items: { id: string }[] }).items.map((i) => i.id)).toEqual([
      'FX-C1',
    ]);

    expect(detail.body).toMatchObject({
      id: 'FX-C1',
      phase: 'grilling',
      column: 'shaping',
    });
  });

  it('returns the first card with 200 when the dedupe_key repeats, and makes nothing new', async () => {
    const first = await post();
    const again = await post({ title: 'Another title for the same click' });

    expect(first.status).toBe(201);
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({
      card: { id: 'FX-C1', title: 'A todo application' },
    });

    const cards = await ctx.storage.transaction((tx) =>
      tx.cards.listByProject('fixture', { limit: 10 }),
    );

    expect(cards).toHaveLength(1);
  });

  it('defaults type, priority, dependencies and links when they are left out', async () => {
    const res = await ctx.rig.json('POST', '/projects/fixture/cards', {
      title: 'Only the needed fields',
      description: 'A description that is long enough to pass.',
      dedupe_key: 'k',
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      card: { type: 'plan', priority: 'normal', links: [], depends_on: [], blocks: [] },
    });
  });

  it('stores a Discussion in grilling too, so the Director only talks', async () => {
    const res = await post({ type: 'discussion' });

    expect(res.body).toMatchObject({ card: { type: 'discussion', phase: 'grilling' } });
  });

  it.each([
    ['a short title', { title: 'abc' }],
    ['a long title', { title: 'x'.repeat(121) }],
    ['a short description', { description: 'too short' }],
    ['an unknown type', { type: 'epic' }],
    ['a type outside plan, discussion and issue', { type: 'pr_issue' }],
    ['an unknown priority', { priority: 'asap' }],
    ['a non-http link', { links: ['javascript:alert(1)'] }],
    ['a link that is not a URL', { links: ['not a url'] }],
    ['a malformed dependency id', { depends_on: ['FX-12'] }],
    ['an unknown field', { column: 'done' }],
    ['no dedupe_key', { dedupe_key: undefined }],
  ])('refuses %s with 400 invalid_request and the issues', async (_name, over) => {
    const res = await post(over);

    expect(res.status).toBe(400);
    expect(errorOf(res)).toMatchObject({ code: 'invalid_request' });
    expect(errorOf(res).issues?.length).toBeGreaterThan(0);
    expect(
      await ctx.storage.transaction((tx) =>
        tx.cards.listByProject('fixture', { limit: 10 }),
      ),
    ).toEqual([]);
  });

  it('answers 404 project_not_found for an unknown project', async () => {
    const res = await post({}, 'nope');

    expect(res.status).toBe(404);
    expect(errorOf(res).code).toBe('project_not_found');
  });

  it('answers 404 card_not_found for an unknown dependency, and stores nothing', async () => {
    const res = await post({ depends_on: ['FX-C99'] });

    expect(res.status).toBe(404);
    expect(errorOf(res)).toMatchObject({ code: 'card_not_found' });
    expect(
      await ctx.storage.transaction((tx) =>
        tx.cards.listByProject('fixture', { limit: 10 }),
      ),
    ).toEqual([]);
  });

  it('answers 400 cross_project_dependency for a card of another project', async () => {
    const other = await make('o', {});
    const res = await ctx.rig.json(
      'POST',
      '/projects/other/cards',
      body({ depends_on: [other] }),
    );

    expect(res.status).toBe(400);
    expect(errorOf(res).code).toBe('cross_project_dependency');
  });

  it('answers 409 dependency_cycle with the loop as a closed path', async () => {
    const a = await make('a');
    const b = await make('b', { depends_on: [a] });

    // The new card depends on B and blocks A, but A already waits through B... A -> new -> B -> A.
    const res = await post({ dedupe_key: 'n', depends_on: [b], blocks: [a] });

    expect(res.status).toBe(409);
    expect(errorOf(res)).toMatchObject({
      code: 'dependency_cycle',
      cycle: ['FX-C3', 'FX-C2', 'FX-C1', 'FX-C3'],
    });
  });

  it('records dependencies in both directions and shows them on both cards', async () => {
    const a = await make('a');
    const b = await make('b');
    const c = await make('c', { depends_on: [a], blocks: [b] });

    const one = (await ctx.rig.json('GET', `/cards/${c}`)).body;
    const other = (await ctx.rig.json('GET', `/cards/${a}`)).body;
    const third = (await ctx.rig.json('GET', `/cards/${b}`)).body;

    expect(one).toMatchObject({ depends_on: [a], blocks: [b] });
    expect(other).toMatchObject({ depends_on: [], blocks: [c] });
    expect(third).toMatchObject({ depends_on: [c], blocks: [] });
  });

  it('answers 409 project_archived for an archived project', async () => {
    await ctx.storage.transaction((tx) =>
      tx.projects.upsert({
        id: 'old',
        slug: 'old',
        prefix: 'OLD',
        status: 'archived',
        ecosystems: [],
        harness_defaults: {},
        tier_c_globs: [],
      }),
    );

    const res = await post({}, 'old');

    expect(res.status).toBe(409);
    expect(errorOf(res).code).toBe('project_archived');
  });

  it('is refused without the token, and 503 while the server drains', async () => {
    const anon = await ctx.rig.json('POST', '/projects/fixture/cards', body(), {
      authorization: '',
    });

    const draining = await startFlowRig({ isDraining: () => true });
    const res = await draining.rig.json('POST', '/projects/fixture/cards', body());
    await draining.close();

    expect(anon.status).toBe(401);
    expect(res.status).toBe(503);
    expect(errorOf(res).code).toBe('server_draining');
  });
});
