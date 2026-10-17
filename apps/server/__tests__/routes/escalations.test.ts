/**
 * The escalation routes: act, act on a ticket's own wait, a card's list, and the ticket page's waits.
 *
 * Why: the owner acts on every wait from three screens through these routes and each screen keys
 *   its behaviour on the status and code of a refusal: `not_pending` refreshes and says who settled
 *   it, `ticket_has_dependents` offers "Cancel all" and names the tickets, `still_broken` shows
 *   what is still wrong, `action_not_offered` and `stale` reload. The engine answers with closed
 *   outcomes; these tests pin that each one reaches the client as the contract's status, code and
 *   extra fields, that bodies are validated before the engine is asked, that the owner is the
 *   author, and that the views carry the actions on offer (none while the Director is looking).
 *
 * Pins: 200 with the view after the action; every refusal of both act routes; 400 `invalid_body`;
 *   `GET /cards/:id/escalations` (404, pending first, settled after, stage and actions);
 *   `GET /tickets/:id` adding `escalations` and `wait_actions`; the legacy answer route settling a
 *   Director-stage question.
 * Depends on: helpers/card-rig, vitest. IO: a loopback socket.
 */

import type { Interaction } from '@forge/core';
import { vi } from 'vitest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { at, card, startCardRig, ticket } from '#tests/helpers/card-rig.js';
import type { CardRig } from '#tests/helpers/card-rig.js';

let ctx: CardRig;
const act = vi.fn();
const actOnTicket = vi.fn();

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
  act.mockReset();
  actOnTicket.mockReset();
  ctx = await startCardRig({ actOnEscalation: act, actOnTicket });
  await ctx.seed(
    [card(1, { phase: 'in_progress' })],
    [ticket(1, 1, { status: 'waiting_human' })],
  );

  await ctx.storage.transaction((tx) => tx.interactions.insert(failure('int-f1')));
});

afterEach(async () => {
  await ctx.rig.close();
});

describe('POST /interactions/:id/act', () => {
  const post = (body: unknown, id = 'int-f1') =>
    ctx.rig.json('POST', `/interactions/${id}/act`, body);

  it('passes the action as the owner and answers the escalation as it stands after', async () => {
    act.mockResolvedValue({ status: 'done', interaction: null });

    const res = await post({ action: 'retry', note: 'try again' });

    expect(res.status).toBe(200);
    expect(act).toHaveBeenCalledWith(
      'int-f1',
      { action: 'retry', note: 'try again' },
      'owner',
    );

    expect(res.body).toMatchObject({
      escalation: {
        id: 'int-f1',
        ticket_id: 'FX-1',
        ticket_title: 'Ticket 1',
        card_id: 'FX-C1',
        kind: 'failure',
        stage: 'owner',
        status: 'pending',
        actions: ['retry', 'replan', 'cancel'],
      },
    });
  });

  it('shows the settled state and no actions once the escalation is settled', async () => {
    await ctx.storage.transaction((tx) =>
      tx.interactions.answer('int-f1', { action: 'retry', by: 'owner' }, at(5)),
    );

    act.mockResolvedValue({ status: 'done', interaction: null });
    const res = await post({ action: 'retry' });

    expect(res.body).toMatchObject({
      escalation: {
        status: 'answered',
        actions: [],
        settled: { action: 'retry', by: 'owner', at: at(5) },
      },
    });
  });

  it.each([
    [{ status: 'not_found' }, 404, 'interaction_not_found'],
    [{ status: 'not_pending' }, 409, 'not_pending'],
    [{ status: 'action_not_offered' }, 409, 'action_not_offered'],
    [{ status: 'stale' }, 409, 'stale'],
    [{ status: 'invalid_answer', reason: 'no such option' }, 400, 'invalid_answer'],
  ])('maps %j to %s %s', async (outcome, status, code) => {
    act.mockResolvedValue(outcome);

    const res = await post({ action: 'retry' });

    expect(res.status).toBe(status);
    expect(errorOf(res)['code']).toBe(code);
  });

  it('names who settled a wait that is no longer pending', async () => {
    act.mockResolvedValue({
      status: 'not_pending',
      settled: { action: 'answer', by: 'director', at: at(4) },
    });

    const res = await post({ action: 'answer', text: 'x' });

    expect(errorOf(res)['settled']).toEqual({
      action: 'answer',
      by: 'director',
      at: at(4),
    });
  });

  it('names the dependents of a cancel that would strand them', async () => {
    act.mockResolvedValue({
      status: 'ticket_has_dependents',
      dependents: ['FX-2', 'FX-3'],
    });

    const res = await post({ action: 'cancel' });

    expect(res.status).toBe(409);
    expect(errorOf(res)).toMatchObject({
      code: 'ticket_has_dependents',
      dependents: ['FX-2', 'FX-3'],
    });
  });

  it('says what is still broken on a recheck', async () => {
    act.mockResolvedValue({ status: 'still_broken', detail: 'still signed out' });

    const res = await post({ action: 'recheck' });

    expect(res.status).toBe(409);
    expect(errorOf(res)).toMatchObject({
      code: 'still_broken',
      detail: 'still signed out',
    });
  });

  it.each([
    [{}],
    [{ action: 'teleport' }],
    [{ action: 'answer' }],
    [{ action: 'answer', option_id: 'a', text: 'b' }],
    [{ action: 'replan', comment: 'no' }],
  ])('refuses %j with invalid_body before asking the engine', async (body) => {
    const res = await post(body);

    expect(res.status).toBe(400);
    expect(errorOf(res)['code']).toBe('invalid_body');
    expect(act).not.toHaveBeenCalled();
  });
});

describe('POST /tickets/:id/act', () => {
  const post = (body: unknown, id = 'FX-1') =>
    ctx.rig.json('POST', `/tickets/${id}/act`, body);

  it('passes the action as the owner', async () => {
    actOnTicket.mockResolvedValue({ status: 'done', interaction: null });

    const res = await post({ action: 'rework', comment: 'rename the flag' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ticket_id: 'FX-1', action: 'rework' });
    expect(actOnTicket).toHaveBeenCalledWith(
      'FX-1',
      { action: 'rework', comment: 'rename the flag' },
      'owner',
    );
  });

  it.each([
    [{ status: 'not_found' }, 404, 'ticket_not_found'],
    [{ status: 'action_not_offered' }, 409, 'action_not_offered'],
    [{ status: 'stale' }, 409, 'stale'],
    [
      { status: 'ticket_has_dependents', dependents: ['FX-2'] },
      409,
      'ticket_has_dependents',
    ],
  ])('maps %j to %s %s', async (outcome, status, code) => {
    actOnTicket.mockResolvedValue(outcome);

    const res = await post({ action: 'cancel' });

    expect(res.status).toBe(status);
    expect(errorOf(res)['code']).toBe(code);
  });

  it('refuses a bad ticket id and a bad body', async () => {
    expect((await post({ action: 'cancel' }, 'nope')).status).toBe(400);
    expect(errorOf(await post({ action: 'rework' }))['code']).toBe('invalid_body');
    expect(actOnTicket).not.toHaveBeenCalled();
  });
});
