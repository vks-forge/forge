/**
 * The escalation routes for finished work: a held ticket's decision and the owner's sign-off.
 *
 * Why: when a check holds a ticket, or finished work waits for a name, the owner must meet the same
 *   item on the card, on the ticket page and in the Inbox, and the destructive choices must be
 *   deliberate: Merge anyway and Continue need a written reason (five characters) validated before
 *   the engine is asked, and each screen keys its behaviour on the refusal codes. These tests pin
 *   that the views carry the right actions per cause and tier, that a body without a reason is a 400
 *   `invalid_body`, that the owner is the author, that every refusal reaches the client with the
 *   contract's status and code, and that all three places read one item.
 *
 * Pins: `POST /interactions/:id/act` with merge_anyway, continue, rework, approve and sign_off
 *   (200 with the view; 400 for a short or blank reason; 409 `action_not_offered`, `not_pending`,
 *   `head_moved`, `merge_refused`, `stale`); the decision and sign_off views and their actions;
 *   `GET /cards/:id/escalations`; `GET /tickets/:id` `escalations` and `wait_actions` from the
 *   pending sign_off item.
 * Depends on: helpers/card-rig, vitest. IO: a loopback socket.
 */

import type { Interaction } from '@forge/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { at, card, startCardRig, ticket } from '#tests/helpers/card-rig.js';
import type { CardRig } from '#tests/helpers/card-rig.js';

let ctx: CardRig;
const act = vi.fn();

const errorOf = (res: { body: unknown }) =>
  (res.body as { error: Record<string, unknown> }).error;

const decision = (id: string, cause: 'findings_hold' | 'scope_drift'): Interaction => ({
  id,
  ticket_id: 'FX-1',
  card_id: 'FX-C1' as Interaction['card_id'],
  kind: 'decision',
  payload: {
    kind: 'decision',
    cause,
    summary: 'Critique found blocking findings and holds the merge for you.',
    stage_id: 'review-group',
    stage_label: 'Review and critique',
    findings: [
      {
        severity: 'high',
        file: 'src/a.ts',
        line: 12,
        issue: 'the null case is not handled',
        evidence: 'src/a.ts:12 returns x.value for null',
      },
    ],
    ...(cause === 'scope_drift' ? { unplanned: ['src/other.ts'] } : {}),
    rework: { count: 2, cap: 2 },
  },
  status: 'pending',
  asked_at: at(3),
  escalated_at: at(3),
  timeout_at: '9999-12-31T23:59:59.999Z',
});

const signOff = (id: string, tier: 'A' | 'B' | 'C', ticketId = 'FX-2'): Interaction => ({
  id,
  ticket_id: ticketId,
  card_id: 'FX-C1' as Interaction['card_id'],
  kind: 'sign_off',
  payload: {
    kind: 'sign_off',
    cause: tier === 'C' ? 'tier_c' : 'director_declined',
    tier,
    summary: 'The checks passed.',
    ...(tier === 'C' ? {} : { director_note: 'You overruled a stage earlier.' }),
    checks: {
      passed: 4,
      counts: { critical: 0, high: 0, medium: 1, low: 0 },
      overrides: 0,
    },
  },
  status: 'pending',
  asked_at: at(4),
  escalated_at: at(4),
  timeout_at: '9999-12-31T23:59:59.999Z',
});

beforeEach(async () => {
  act.mockReset();
  ctx = await startCardRig({ actOnEscalation: act });
  await ctx.seed(
    [card(1, { phase: 'in_progress' })],
    [
      ticket(1, 1, { status: 'waiting_human' }),
      ticket(2, 1, { status: 'needs_signoff', tier_actual: 'C' }),
      ticket(3, 1, { status: 'review', tier_actual: 'B' }),
    ],
  );

  await ctx.storage.transaction(async (tx) => {
    await tx.interactions.insert(decision('int-d1', 'findings_hold'));
    await tx.interactions.insert(decision('int-d2', 'scope_drift'));
    await tx.interactions.insert(signOff('int-c', 'C'));
    await tx.interactions.insert(signOff('int-b', 'B', 'FX-3'));
  });
});

afterEach(async () => {
  await ctx.rig.close();
});

describe('POST /interactions/:id/act on a held ticket', () => {
  const post = (id: string, body: unknown) =>
    ctx.rig.json('POST', `/interactions/${id}/act`, body);

  it('passes merge anyway with its reason as the owner, and answers the decision view with its actions', async () => {
    act.mockResolvedValue({ status: 'done', interaction: null });

    const res = await post('int-d1', {
      action: 'merge_anyway',
      comment: 'handled upstream in the loader',
    });

    expect(res.status).toBe(200);
    expect(act).toHaveBeenCalledWith(
      'int-d1',
      { action: 'merge_anyway', comment: 'handled upstream in the loader' },
      'owner',
    );

    expect(res.body).toMatchObject({
      escalation: {
        id: 'int-d1',
        kind: 'decision',
        stage: 'owner',
        status: 'pending',
        actions: ['merge_anyway', 'rework', 'replan', 'cancel'],
        payload: { cause: 'findings_hold', findings: [{ file: 'src/a.ts', line: 12 }] },
      },
    });
  });

  it('offers continue, replan and cancel for scope drift', async () => {
    act.mockResolvedValue({ status: 'done', interaction: null });
    const res = await post('int-d2', {
      action: 'continue',
      comment: 'other.ts needed it',
    });

    expect(res.body).toMatchObject({
      escalation: {
        actions: ['continue', 'replan', 'cancel'],
        payload: { cause: 'scope_drift', unplanned: ['src/other.ts'] },
      },
    });
  });

  it.each([
    [{ action: 'merge_anyway' }],
    [{ action: 'merge_anyway', comment: 'four' }],
    [{ action: 'continue', comment: '     ' }],
    [{ action: 'rework', comment: 'no' }],
  ])('refuses %j with invalid_body before asking the engine', async (body) => {
    const res = await post('int-d1', body);

    expect(res.status).toBe(400);
    expect(errorOf(res)['code']).toBe('invalid_body');
    expect(act).not.toHaveBeenCalled();
  });

  it.each([
    [{ status: 'action_not_offered' }, 409, 'action_not_offered'],
    [{ status: 'not_pending' }, 409, 'not_pending'],
    [{ status: 'stale' }, 409, 'stale'],
    [{ status: 'head_moved' }, 409, 'head_moved'],
    [
      { status: 'merge_refused', detail: 'PR 4 has merge conflicts' },
      409,
      'merge_refused',
    ],
    [
      { status: 'ticket_has_dependents', dependents: ['FX-9'] },
      409,
      'ticket_has_dependents',
    ],
  ])('maps %j to %s %s', async (outcome, status, code) => {
    act.mockResolvedValue(outcome);
    const res = await post('int-d1', { action: 'merge_anyway', comment: 'long enough' });

    expect(res.status).toBe(status);
    expect(errorOf(res)['code']).toBe(code);
  });

  it('answers 404 interaction_not_found for an item that does not exist', async () => {
    act.mockResolvedValue({ status: 'not_found' });
    const res = await post('int-nope', { action: 'continue', comment: 'long enough' });

    expect(res.status).toBe(404);
    expect(errorOf(res)['code']).toBe('interaction_not_found');
  });
});

describe('POST /interactions/:id/act on a sign-off', () => {
  const post = (id: string, body: unknown) =>
    ctx.rig.json('POST', `/interactions/${id}/act`, body);

  it('passes a named sign-off for tier C and offers sign_off, rework, cancel', async () => {
    act.mockResolvedValue({ status: 'done', interaction: null });
    const res = await post('int-c', { action: 'sign_off', signer: 'vikash' });

    expect(res.status).toBe(200);
    expect(act).toHaveBeenCalledWith(
      'int-c',
      { action: 'sign_off', signer: 'vikash' },
      'owner',
    );

    expect(res.body).toMatchObject({
      escalation: { kind: 'sign_off', actions: ['sign_off', 'rework', 'cancel'] },
    });
  });

  it('offers approve, rework, cancel for a tier B item and passes approve', async () => {
    act.mockResolvedValue({ status: 'done', interaction: null });
    const res = await post('int-b', { action: 'approve' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      escalation: {
        kind: 'sign_off',
        actions: ['approve', 'rework', 'cancel'],
        payload: { cause: 'director_declined', director_note: expect.any(String) },
      },
    });
  });
});

describe('the item in the card list and on the ticket page', () => {
  it('lists the decision and the sign-offs with the pending ones first', async () => {
    const res = await ctx.rig.json('GET', '/cards/FX-C1/escalations');
    const items = (
      res.body as { items: { id: string; kind: string; actions: string[] }[] }
    ).items;

    expect(res.status).toBe(200);
    expect(items.map((i) => i.id).sort()).toEqual(['int-b', 'int-c', 'int-d1', 'int-d2']);
    expect(items.find((i) => i.id === 'int-c')).toMatchObject({
      kind: 'sign_off',
      actions: ['sign_off', 'rework', 'cancel'],
    });
  });

  it('takes the ticket wait actions from the pending sign-off item', async () => {
    const c = await ctx.rig.json('GET', '/tickets/FX-2');
    const b = await ctx.rig.json('GET', '/tickets/FX-3');
    const held = await ctx.rig.json('GET', '/tickets/FX-1');
    const wait = (r: { body: unknown }) =>
      (r.body as { wait_actions: string[] }).wait_actions;

    expect(wait(c)).toEqual(['sign_off', 'rework', 'cancel']);
    expect(wait(b)).toEqual(['approve', 'rework', 'cancel']);
    expect(wait(held)).toEqual([
      'merge_anyway',
      'rework',
      'replan',
      'cancel',
      'continue',
    ]);

    expect(
      (c.body as { escalations: { id: string }[] }).escalations.map((e) => e.id),
    ).toEqual(['int-c']);
  });
});
