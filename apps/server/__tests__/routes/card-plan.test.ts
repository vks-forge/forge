/**
 * The planning routes: grill answers and shortcuts, plan reads, approval, change requests,
 * ticket edits, start-planning and run-as-express, over a scripted engine.
 *
 * Why: the card page drives the whole Director planning flow through these routes, and it
 *   keys its behaviour on the status and code of each refusal (a stale plan reloads, a
 *   removal with dependents names who depends on the ticket, a closed question just refreshes).
 *   The engine answers every door with a closed outcome; these tests pin that each outcome
 *   reaches the client as the contract's status, code and extra fields, that bodies are
 *   validated before the engine is asked, that the owner is the author, and that nothing works
 *   without the token. Whether a write reaches the project stream is pinned against the real
 *   engine in card-plan-live.test.ts.
 *
 * Pins: 200 shapes, every refusal status and code per route, 400 `invalid_request` and
 *   `invalid_card_id`, the `dependents` and `key` fields, the `owner` author, 401.
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

describe('GET /cards/:id/plan', () => {
  it('answers the versions, the current plan and the floor', async () => {
    mock['cardPlans']!.mockResolvedValue({
      status: 'ok',
      versions: [{ version: 1, created_at: '2026-10-16T12:00:00.000Z' }],
      current: plan,
      floor: { pass: true, reasons: [] },
    });

    const res = await ctx.rig.json('GET', `/cards/${card.id}/plan`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      versions: [{ version: 1, created_at: '2026-10-16T12:00:00.000Z' }],
      current: plan,
      floor: { pass: true, reasons: [] },
    });
  });

  it('answers 404 card_not_found for an unknown card and 400 for a malformed id', async () => {
    mock['cardPlans']!.mockResolvedValue({ status: 'not_found' });

    const missing = await ctx.rig.json('GET', '/cards/FX-C99/plan');
    const bad = await ctx.rig.json('GET', '/cards/nope/plan');

    expect(missing.status).toBe(404);
    expect(errorOf(missing).code).toBe('card_not_found');
    expect(bad.status).toBe(400);
    expect(errorOf(bad).code).toBe('invalid_card_id');
  });
});

describe('GET /cards/:id/plan/:version', () => {
  it('answers one version, 404 plan_not_found for a missing one, 400 for a bad number', async () => {
    mock['cardPlan']!.mockResolvedValueOnce({ status: 'ok', plan }).mockResolvedValueOnce(
      { status: 'plan_not_found' },
    );

    const ok = await ctx.rig.json('GET', `/cards/${card.id}/plan/2`);
    const gone = await ctx.rig.json('GET', `/cards/${card.id}/plan/9`);
    const bad = await ctx.rig.json('GET', `/cards/${card.id}/plan/zero`);

    expect(ok.body).toEqual({ plan });
    expect(mock['cardPlan']).toHaveBeenCalledWith(card.id, 2);
    expect(gone.status).toBe(404);
    expect(errorOf(gone).code).toBe('plan_not_found');
    expect(bad.status).toBe(400);
  });
});

describe('POST /cards/:id/grill/answer', () => {
  const post = (body: unknown) =>
    ctx.rig.json('POST', `/cards/${card.id}/grill/answer`, body);

  it('passes an option answer with the owner as author and answers the card', async () => {
    mock['answerGrill']!.mockResolvedValue({ status: 'answered', card });

    const res = await post({ question_id: 'q1', option_id: 'a' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ card: { id: card.id } });
    expect(mock['answerGrill']).toHaveBeenCalledWith(
      card.id,
      { question_id: 'q1', option_id: 'a' },
      'owner',
    );
  });

  it('passes a free-text answer', async () => {
    mock['answerGrill']!.mockResolvedValue({ status: 'answered', card });

    await post({ question_id: 'q1', text: 'Use SQLite' });

    expect(mock['answerGrill']).toHaveBeenCalledWith(
      card.id,
      { question_id: 'q1', text: 'Use SQLite' },
      'owner',
    );
  });

  it.each([
    [{ question_id: 'q1' }],
    [{ question_id: 'q1', option_id: 'a', text: 'both' }],
    [{ option_id: 'a' }],
    [{ question_id: 'q1', text: '' }],
    [{ question_id: 'q1', text: 'x', extra: 1 }],
  ])('rejects the body %j before asking the engine', async (body) => {
    const res = await post(body);

    expect(res.status).toBe(400);
    expect(errorOf(res).code).toBe('invalid_request');
    expect(mock['answerGrill']).not.toHaveBeenCalled();
  });

  it.each([
    [{ status: 'question_not_open' }, 409, 'question_not_open'],
    [{ status: 'invalid_answer', reason: 'no such option' }, 400, 'invalid_answer'],
    [{ status: 'not_found' }, 404, 'card_not_found'],
  ])('maps %j to %i %s', async (outcome, status, code) => {
    mock['answerGrill']!.mockResolvedValue(outcome);

    const res = await post({ question_id: 'q1', option_id: 'a' });

    expect(res.status).toBe(status);
    expect(errorOf(res).code).toBe(code);
  });
});

describe('POST /cards/:id/grill/shortcut', () => {
  const post = (body: unknown) =>
    ctx.rig.json('POST', `/cards/${card.id}/grill/shortcut`, body);

  it.each(['use_recommendations', 'write_plan_now'])('applies %s', async (kind) => {
    mock['grillShortcut']!.mockResolvedValue({ status: 'applied', card });

    const res = await post({ kind });

    expect(res.status).toBe(200);
    expect(mock['grillShortcut']).toHaveBeenCalledWith(card.id, kind, 'owner');
  });

  it('rejects an unknown kind', async () => {
    const res = await post({ kind: 'skip' });

    expect(res.status).toBe(400);
    expect(mock['grillShortcut']).not.toHaveBeenCalled();
  });

  it.each([
    [{ status: 'phase_mismatch' }, 409, 'phase_mismatch'],
    [{ status: 'not_found' }, 404, 'card_not_found'],
  ])('maps %j to %i %s', async (outcome, status, code) => {
    mock['grillShortcut']!.mockResolvedValue(outcome);

    const res = await post({ kind: 'write_plan_now' });

    expect(res.status).toBe(status);
    expect(errorOf(res).code).toBe(code);
  });
});

describe('POST /cards/:id/plan/approve', () => {
  const post = (body: unknown) =>
    ctx.rig.json('POST', `/cards/${card.id}/plan/approve`, body);

  it('approves a version and answers the card and the ticket ids', async () => {
    mock['approvePlan']!.mockResolvedValue({
      status: 'approved',
      card,
      ticket_ids: ['FX-1', 'FX-2'],
    });

    const res = await post({ version: 2 });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      card: { id: card.id },
      ticket_ids: ['FX-1', 'FX-2'],
    });

    expect(mock['approvePlan']).toHaveBeenCalledWith(card.id, 2, 'owner');
  });

  it.each([{}, { version: 0 }, { version: 1.5 }, { version: '2' }])(
    'rejects the body %j',
    async (body) => {
      const res = await post(body);

      expect(res.status).toBe(400);
      expect(errorOf(res).code).toBe('invalid_request');
      expect(mock['approvePlan']).not.toHaveBeenCalled();
    },
  );

  it.each([
    [{ status: 'stale_plan' }, 409, 'stale_plan'],
    [{ status: 'phase_mismatch' }, 409, 'phase_mismatch'],
    [{ status: 'plan_not_found' }, 404, 'plan_not_found'],
    [{ status: 'not_found' }, 404, 'card_not_found'],
  ])('maps %j to %i %s', async (outcome, status, code) => {
    mock['approvePlan']!.mockResolvedValue(outcome);

    const res = await post({ version: 2 });

    expect(res.status).toBe(status);
    expect(errorOf(res).code).toBe(code);
  });
});

describe('POST /cards/:id/plan/request-changes', () => {
  const post = (body: unknown) =>
    ctx.rig.json('POST', `/cards/${card.id}/plan/request-changes`, body);

  it('passes the comment and answers the card', async () => {
    mock['requestPlanChanges']!.mockResolvedValue({ status: 'requested', card });

    const res = await post({ version: 2, comment: 'Split the form ticket' });

    expect(res.status).toBe(200);
    expect(mock['requestPlanChanges']).toHaveBeenCalledWith(
      card.id,
      2,
      'Split the form ticket',
      'owner',
    );
  });

  it('rejects a comment under 5 characters before asking the engine', async () => {
    const res = await post({ version: 2, comment: 'no' });

    expect(res.status).toBe(400);
    expect(errorOf(res).code).toBe('invalid_request');
    expect(mock['requestPlanChanges']).not.toHaveBeenCalled();
  });

  it.each([
    [{ status: 'stale_plan' }, 409, 'stale_plan'],
    [{ status: 'phase_mismatch' }, 409, 'phase_mismatch'],
    [{ status: 'invalid_comment' }, 400, 'invalid_comment'],
    [{ status: 'not_found' }, 404, 'card_not_found'],
  ])('maps %j to %i %s', async (outcome, status, code) => {
    mock['requestPlanChanges']!.mockResolvedValue(outcome);

    const res = await post({ version: 2, comment: 'Split the form ticket' });

    expect(res.status).toBe(status);
    expect(errorOf(res).code).toBe(code);
  });
});
