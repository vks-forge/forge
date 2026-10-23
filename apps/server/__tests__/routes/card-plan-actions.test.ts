/**
 * The planning routes for ticket edits, start-planning and run-as-express, over a scripted engine.
 *
 * Why: the card page drives the whole Director planning flow through these routes, and it
 *   keys its behaviour on the status and code of each refusal (a stale plan reloads, a
 *   removal with dependents names who depends on the ticket, a closed question just refreshes).
 *   The engine answers every door with a closed outcome; these tests pin that each outcome
 *   reaches the client as the contract's status, code and extra fields, that bodies are
 *   validated before the engine is asked, that the owner is the author, and that nothing works
 *   without the token. Whether a write reaches the project stream is pinned against the real
 *   engine in card-plan-live.test.ts; the other routes are in card-plan.test.ts.
 *
 * Pins: every refusal status and code of the three routes, the `key` and `dependents`
 *   fields, body validation, the `owner` author, and 401 for every planning route.
 * Depends on: helpers/flow-rig, helpers/engine-mock, vitest. IO: a loopback socket.
 */

import type { Card } from '@forge/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeEngineMock } from '#tests/helpers/engine-mock.js';
import type { EngineMock } from '#tests/helpers/engine-mock.js';
import { startFlowRig } from '#tests/helpers/flow-rig.js';
import type { FlowRig } from '#tests/helpers/flow-rig.js';

let ctx: FlowRig;
let mock: EngineMock;
let card: Card;

const errorOf = (res: { body: unknown }) =>
  (res.body as { error: { code: string; key?: string; dependents?: string[] } }).error;

beforeEach(async () => {
  mock = makeEngineMock();
  ctx = await startFlowRig({ engine: mock as never });
  // The scripted engine only stands in for the planning doors; card creation stays real.
  mock['createCard'] = ctx.engine.createCard.bind(ctx.engine) as never;
  const res = await ctx.rig.json('POST', '/projects/fixture/cards', {
    title: 'A todo application',
    description: 'Build a small todo application with a list and a form.',
    type: 'plan',
    priority: 'normal',
    dedupe_key: 'k-1',
  });

  card = (res.body as { card: Card }).card;
});

afterEach(async () => {
  await ctx.close();
});

const plan = { version: 2, card_id: 'FX-C1', tickets: [] };

describe('PATCH /cards/:id/plan/:version/tickets', () => {
  const patch = (body: unknown, version = 2) =>
    ctx.rig.json('PATCH', `/cards/${card.id}/plan/${version}/tickets`, body);

  const edits = {
    tickets: [{ key: 'a', title: 'New title', priority: 'high' }],
    order: ['a'],
  };

  it('passes the edits and answers the new version', async () => {
    mock['editPlanTickets']!.mockResolvedValue({ status: 'edited', plan });

    const res = await patch(edits);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ plan });
    expect(mock['editPlanTickets']).toHaveBeenCalledWith(card.id, 2, edits, 'owner');
  });

  it('passes the owner lane of a ticket to the engine and rejects an unknown lane', async () => {
    mock['editPlanTickets']!.mockResolvedValue({ status: 'edited', plan });
    const lane = { tickets: [{ key: 'a', lane: 'express' }] };

    expect((await patch(lane)).status).toBe(200);
    expect(mock['editPlanTickets']).toHaveBeenCalledWith(card.id, 2, lane, 'owner');
    expect((await patch({ tickets: [{ key: 'a', lane: 'fast' }] })).status).toBe(400);
  });

  it.each([
    [{}],
    [{ tickets: [{ title: 'no key' }] }],
    [{ tickets: [{ key: 'a', priority: 'huge' }] }],
    [{ tickets: [{ key: 'a', removed: 'yes' }] }],
  ])('rejects the body %j', async (body) => {
    const res = await patch(body);

    expect(res.status).toBe(400);
    expect(errorOf(res).code).toBe('invalid_request');
    expect(mock['editPlanTickets']).not.toHaveBeenCalled();
  });

  it('rejects a version that is not a positive integer', async () => {
    const res = await ctx.rig.json('PATCH', `/cards/${card.id}/plan/abc/tickets`, edits);

    expect(res.status).toBe(400);
  });

  it('answers 409 ticket_has_dependents with the key and its dependents', async () => {
    mock['editPlanTickets']!.mockResolvedValue({
      status: 'ticket_has_dependents',
      key: 'a',
      dependents: ['b', 'c'],
    });

    const res = await patch({ tickets: [{ key: 'a', removed: true }] });

    expect(res.status).toBe(409);
    expect(errorOf(res)).toMatchObject({
      code: 'ticket_has_dependents',
      key: 'a',
      dependents: ['b', 'c'],
    });
  });

  it.each([
    [{ status: 'stale_plan' }, 409, 'stale_plan'],
    [{ status: 'phase_mismatch' }, 409, 'phase_mismatch'],
    [{ status: 'unknown_ticket', key: 'zz' }, 400, 'unknown_ticket'],
    [{ status: 'invalid_order' }, 400, 'invalid_order'],
    [{ status: 'empty_plan' }, 400, 'empty_plan'],
    [{ status: 'not_found' }, 404, 'card_not_found'],
  ])('maps %j to %i %s', async (outcome, status, code) => {
    mock['editPlanTickets']!.mockResolvedValue(outcome);

    const res = await patch(edits);

    expect(res.status).toBe(status);
    expect(errorOf(res).code).toBe(code);
  });

  it('names the unknown ticket key in the error', async () => {
    mock['editPlanTickets']!.mockResolvedValue({ status: 'unknown_ticket', key: 'zz' });

    const res = await patch(edits);

    expect(errorOf(res).key).toBe('zz');
  });
});

describe('POST /cards/:id/start-planning', () => {
  const post = () => ctx.rig.json('POST', `/cards/${card.id}/start-planning`);

  it('starts planning and answers the card', async () => {
    mock['startPlanning']!.mockResolvedValue({ status: 'started', card });

    const res = await post();

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ card: { id: card.id } });
    expect(mock['startPlanning']).toHaveBeenCalledWith(card.id, 'owner');
  });

  it.each([
    [{ status: 'phase_mismatch' }, 409, 'phase_mismatch'],
    [{ status: 'not_plannable' }, 409, 'not_plannable'],
    [{ status: 'not_found' }, 404, 'card_not_found'],
  ])('maps %j to %i %s', async (outcome, status, code) => {
    mock['startPlanning']!.mockResolvedValue(outcome);

    const res = await post();

    expect(res.status).toBe(status);
    expect(errorOf(res).code).toBe(code);
  });
});

describe('POST /cards/:id/planning/retry', () => {
  const post = () => ctx.rig.json('POST', `/cards/${card.id}/planning/retry`);

  it('retries the stopped step and answers the card', async () => {
    mock['retryPlanningStep']!.mockResolvedValue({ status: 'retried', card });

    const res = await post();

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ card: { id: card.id } });
    expect(mock['retryPlanningStep']).toHaveBeenCalledWith(card.id, 'owner');
  });

  it.each([
    [{ status: 'phase_mismatch' }, 409, 'phase_mismatch'],
    [{ status: 'not_found' }, 404, 'card_not_found'],
  ])('maps %j to %i %s', async (outcome, status, code) => {
    mock['retryPlanningStep']!.mockResolvedValue(outcome);

    const res = await post();

    expect(res.status).toBe(status);
    expect(errorOf(res).code).toBe(code);
  });

  it('rejects a malformed card id before calling the engine', async () => {
    const res = await ctx.rig.json('POST', '/cards/nope/planning/retry');

    expect(res.status).toBe(400);
    expect(mock['retryPlanningStep']).not.toHaveBeenCalled();
  });
});

describe('POST /tickets/:id/run-as-express', () => {
  const post = (id = 'FX-1') => ctx.rig.json('POST', `/tickets/${id}/run-as-express`);

  it('releases the ticket and answers its id', async () => {
    mock['runAsExpress']!.mockResolvedValue({
      status: 'released',
      ticket: { id: 'FX-1' },
    });

    const res = await post();

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ticket_id: 'FX-1' });
    expect(mock['runAsExpress']).toHaveBeenCalledWith('FX-1', 'owner');
  });

  it.each([
    [{ status: 'not_held' }, 409, 'not_held'],
    [{ status: 'not_found' }, 404, 'ticket_not_found'],
  ])('maps %j to %i %s', async (outcome, status, code) => {
    mock['runAsExpress']!.mockResolvedValue(outcome);

    const res = await post();

    expect(res.status).toBe(status);
    expect(errorOf(res).code).toBe(code);
  });

  it('rejects a malformed ticket id', async () => {
    const res = await post('nope');

    expect(res.status).toBe(400);
    expect(mock['runAsExpress']).not.toHaveBeenCalled();
  });
});

describe('authentication', () => {
  it.each([
    ['GET', '/cards/FX-C1/plan'],
    ['GET', '/cards/FX-C1/plan/1'],
    ['POST', '/cards/FX-C1/grill/answer'],
    ['POST', '/cards/FX-C1/grill/shortcut'],
    ['POST', '/cards/FX-C1/plan/approve'],
    ['POST', '/cards/FX-C1/plan/request-changes'],
    ['PATCH', '/cards/FX-C1/plan/1/tickets'],
    ['POST', '/cards/FX-C1/start-planning'],
    ['POST', '/tickets/FX-1/run-as-express'],
  ])('refuses %s %s without the token', async (method, path) => {
    const res = await ctx.rig.json(method, path, method === 'GET' ? undefined : {}, {
      authorization: '',
    });

    expect(res.status).toBe(401);
  });
});
