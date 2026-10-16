/**
 * `PUT /cards/:id/relations` on the real engine door.
 *
 * Why: cards carry "depends on" and "blocks" links in both directions, settable from the card
 *   page (d-0129). The body is the complete set, so the page never diffs; the engine replaces
 *   the edges after the same checks as creation and the routes must answer the contract codes,
 *   carrying the loop in the error so the page can name it. A closed card takes no change, as
 *   for PATCH, and nothing without the token.
 *
 * Pins: 200 with the updated card and the replaced edges on both cards, clearing, 409
 *   `dependency_cycle` with the loop and the old edges kept, 404 `card_not_found`, 400
 *   `invalid_card_id`, `cross_project_dependency` and `invalid_request`, 409 `card_closed`, 401.
 * Depends on: helpers/flow-rig, vitest. IO: a loopback socket.
 */

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
  links: [],
  dedupe_key: 'key-1',
  ...over,
});

const make = async (key: string, over: Record<string, unknown> = {}): Promise<string> => {
  const res = await ctx.rig.json(
    'POST',
    '/projects/fixture/cards',
    body({ dedupe_key: key, ...over }),
  );

  expect(res.status).toBe(201);

  return (res.body as { card: { id: string } }).card.id;
};

const errorOf = (res: { body: unknown }) =>
  (res.body as { error: { code: string; cycle?: string[] } }).error;

beforeEach(async () => {
  ctx = await startFlowRig();
});

afterEach(async () => {
  await ctx.close();
});

describe('PUT /cards/:id/relations', () => {
  const put = (id: string, over: Record<string, unknown> = {}) =>
    ctx.rig.json('PUT', `/cards/${id}/relations`, {
      depends_on: [],
      blocks: [],
      ...over,
    });

  it('replaces the card dependencies and answers the updated card', async () => {
    const a = await make('a');
    const b = await make('b');
    const c = await make('c', { depends_on: [a] });

    const res = await put(c, { depends_on: [b], blocks: [a] });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      card: { id: c, depends_on: [b], blocks: [a], phase: 'grilling' },
    });

    expect((await ctx.rig.json('GET', `/cards/${a}`)).body).toMatchObject({
      depends_on: [c],
      blocks: [],
    });
  });

  it('clears the dependencies when both lists are empty', async () => {
    const a = await make('a');
    const b = await make('b', { depends_on: [a] });

    const res = await put(b);

    expect(res.body).toMatchObject({ card: { depends_on: [], blocks: [] } });
  });

  it('answers 409 dependency_cycle with the loop and keeps the old dependencies', async () => {
    const a = await make('a');
    const b = await make('b', { depends_on: [a] });
    const c = await make('c', { depends_on: [b] });

    const res = await put(a, { depends_on: [c], blocks: [b] });

    expect(res.status).toBe(409);
    expect(errorOf(res)).toMatchObject({
      code: 'dependency_cycle',
      cycle: [a, c, b, a],
    });

    expect((await ctx.rig.json('GET', `/cards/${b}`)).body).toMatchObject({
      depends_on: [a],
    });
  });

  it('answers 404 for an unknown card or dependency, 400 for a malformed id and 400 across projects', async () => {
    const a = await make('a');
    const other = (
      (await ctx.rig.json('POST', '/projects/other/cards', body({ dedupe_key: 'o' })))
        .body as {
        card: { id: string };
      }
    ).card.id;

    const missing = await put('FX-C99');
    const unknownDep = await put(a, { depends_on: ['FX-C99'] });
    const malformed = await put('FX-99');
    const cross = await put(a, { blocks: [other] });
    const badBody = await ctx.rig.json('PUT', `/cards/${a}/relations`, {
      depends_on: 'x',
    });

    expect(missing.status).toBe(404);
    expect(errorOf(missing).code).toBe('card_not_found');
    expect(unknownDep.status).toBe(404);
    expect(malformed.status).toBe(400);
    expect(errorOf(malformed).code).toBe('invalid_card_id');
    expect(cross.status).toBe(400);
    expect(errorOf(cross).code).toBe('cross_project_dependency');
    expect(badBody.status).toBe(400);
    expect(errorOf(badBody).code).toBe('invalid_request');
  });

  it('answers 409 card_closed for a closed card, as PATCH does', async () => {
    const a = await make('a');
    await ctx.rig.json('PATCH', `/cards/${a}`, { closed_reason: 'duplicate' });

    const res = await put(a);

    expect(res.status).toBe(409);
    expect(errorOf(res).code).toBe('card_closed');
  });

  it('is refused without the token', async () => {
    const a = await make('a');

    const res = await ctx.rig.json(
      'PUT',
      `/cards/${a}/relations`,
      { depends_on: [], blocks: [] },
      { authorization: '' },
    );

    expect(res.status).toBe(401);
  });
});
