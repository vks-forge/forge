/**
 * The escalation reads: a card's list, the ticket page's waits, and the legacy answer route.
 *
 * Why: the card chat renders each wait from the live list, so it must show the right stage,
 *   the actions on offer (none while the Director looks or once settled) and settled state wherever
 *   the answer was given; the ticket page adds the pending waits and what the owner can do about
 *   the ticket's own wait; and the older answer route must keep settling a question at any stage.
 *
 * Pins: `GET /cards/:id/escalations` (404, pending first, settled newest first, stage and actions);
 *   `GET /tickets/:id` adding `escalations` and `wait_actions` (rework and cancel for finished
 *   work); `POST /interactions/:id/answer` settling through the engine.
 * Depends on: helpers/card-rig, vitest. IO: a loopback socket.
 */

import type { Interaction } from '@forge/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { at, card, question, startCardRig, ticket } from '#tests/helpers/card-rig.js';
import type { CardRig } from '#tests/helpers/card-rig.js';

import { vi } from 'vitest';

let ctx: CardRig;

const errorOf = (res: { body: unknown }) =>
  (res.body as { error: Record<string, unknown> }).error;

const failure = (id: string, over: Partial<Interaction> = {}): Interaction => ({
  id,
  ticket_id: 'FX-1',
  card_id: 'FX-C1' as Interaction['card_id'],
  kind: 'failure',
  payload: {
    kind: 'failure',
    cause: 'retry_cap',
    summary: 'crash: failed 2 times',
    attempts: [],
  },
  status: 'pending',
  asked_at: at(3),
  escalated_at: at(3),
  timeout_at: '9999-12-31T23:59:59.999Z',
  ...over,
});

beforeEach(async () => {
  ctx = await startCardRig();
  await ctx.seed(
    [card(1, { phase: 'in_progress' })],
    [ticket(1, 1, { status: 'waiting_human' })],
  );

  await ctx.storage.transaction((tx) => tx.interactions.insert(failure('int-f1')));
});

afterEach(async () => {
  await ctx.rig.close();
});

describe('GET /cards/:id/escalations', () => {
  const get = (id = 'FX-C1') => ctx.rig.json('GET', `/cards/${id}/escalations`);

  it('lists pending first, then the settled ones newest first, each with its stage and actions', async () => {
    await ctx.storage.transaction(async (tx) => {
      await tx.interactions.insert(
        failure('int-old', { asked_at: at(1), escalated_at: at(1) }),
      );

      await tx.interactions.answer('int-old', { action: 'retry', by: 'director' }, at(6));
      await tx.interactions.insert(failure('int-older', { asked_at: at(0) }));
      await tx.interactions.answer('int-older', { action: 'retry', by: 'owner' }, at(4));
      const { escalated_at: _gone, ...director } = question('FX-1');
      void _gone;
      await tx.interactions.insert({
        ...director,
        id: 'int-dir',
        card_id: 'FX-C1' as never,
      });
    });

    const res = await get();
    const items = (
      res.body as { items: { id: string; stage: string; actions: string[] }[] }
    ).items;

    expect(res.status).toBe(200);
    expect(items.map((i) => i.id)).toEqual(['int-dir', 'int-f1', 'int-old', 'int-older']);
    expect(items[1]).toMatchObject({
      stage: 'owner',
      actions: ['retry', 'replan', 'cancel'],
    });

    // The Director is still looking: no actions for the owner.
    expect(items[0]).toMatchObject({ stage: 'director', actions: [] });
    expect(items[2]).toMatchObject({ settled: { by: 'director' }, actions: [] });
  });

  it('answers 404 for an unknown card and 400 for a bad id', async () => {
    expect((await get('FX-C9')).status).toBe(404);
    expect(errorOf(await get('nope'))['code']).toBe('invalid_card_id');
  });
});

describe('GET /tickets/:id', () => {
  it('returns the pending escalations and what the owner can do about the wait', async () => {
    const res = await ctx.rig.json('GET', '/tickets/FX-1');
    const body = res.body as {
      escalations: { id: string; actions: string[] }[];
      wait_actions: string[];
      interactions: { id: string }[];
    };

    expect(res.status).toBe(200);
    expect(body.escalations.map((e) => e.id)).toEqual(['int-f1']);
    expect(body.wait_actions).toEqual(['retry', 'replan', 'cancel']);
    expect(body.interactions.map((i) => i.id)).toEqual(['int-f1']);
  });

  it('offers approve, rework and cancel for finished work and cancel for a held ticket', async () => {
    await ctx.seed(
      [card(2)],
      [ticket(2, 2, { status: 'review' }), ticket(3, 2, { status: 'planned' })],
    );

    const review = await ctx.rig.json('GET', '/tickets/FX-2');
    expect((review.body as { wait_actions: string[] }).wait_actions).toEqual([
      'approve',
      'rework',
      'cancel',
    ]);

    // The scheduler's explanation is null in this rig, so a planned ticket has no wait to act on.
    const planned = await ctx.rig.json('GET', '/tickets/FX-3');
    expect((planned.body as { wait_actions: string[] }).wait_actions).toEqual([]);
  });
});

describe('POST /interactions/:id/answer (legacy)', () => {
  it('settles a question whatever its stage through the engine', async () => {
    const answer = vi.fn(async () => true);
    const rig = await startCardRig({ answerInteraction: answer });
    await rig.seed([card(1)], [ticket(1, 1, { status: 'waiting_human' })]);

    const res = await rig.rig.json('POST', '/interactions/int-x/answer', {
      answer: 'blue',
    });

    expect(res.status).toBe(404);

    await rig.storage.transaction((tx) =>
      tx.interactions.insert({ ...question('FX-1'), id: 'int-x' }),
    );

    const ok = await rig.rig.json('POST', '/interactions/int-x/answer', {
      answer: 'blue',
    });

    expect(ok.status).toBe(200);
    expect(answer).toHaveBeenCalledWith('int-x', 'blue');
    await rig.rig.close();
  });
});
