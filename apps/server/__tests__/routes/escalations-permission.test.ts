/**
 * The routes for a tool approval: the owner's three answers, and where the item shows up.
 *
 * Why: a Standard Worker's call waits on the owner as one pending `permission` item, and the owner
 *   answers it from the dock, the Inbox or the ticket page through `POST /interactions/:id/act`.
 *   The route must pass exactly the owner's choice to the engine (allow once, always for this
 *   project, deny with an optional note), refuse a body that is not one of them before the engine
 *   is asked, report a second click as 409 `not_pending`, and show the item with the right buttons:
 *   no "Always" when no narrow rule exists. The same item must reach the card's Needs-you dock and
 *   the Inbox titled with the exact call, so the owner sees the same thing on every screen.
 *
 * Pins: act with allow_once / allow_always / deny (note) reaches the engine as the owner; invalid
 *   bodies are 400 `invalid_body`; 409 `not_pending`; `GET /cards/:id/escalations` actions with and
 *   without an always rule; the card detail's needs-you item (`tool_approval`); a settle answered
 *   by the owner shows no actions.
 * Depends on: helpers/card-rig, helpers/read-rig, vitest. IO: a loopback socket.
 */

import type { CardId, Interaction } from '@forge/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { at, card, startCardRig, ticket } from '#tests/helpers/card-rig.js';
import type { CardRig } from '#tests/helpers/card-rig.js';

const CARD = 'FX-C1' as CardId;
const act = vi.fn();
let ctx: CardRig;

const permission = (
  id: string,
  always: { offered: boolean; rule?: { action: string; resource: string }; why?: string },
  over: Partial<Interaction> = {},
): Interaction => ({
  id,
  ticket_id: 'FX-1',
  run_id: 'run-1',
  card_id: CARD,
  kind: 'permission',
  payload: {
    kind: 'permission',
    tool: 'shell',
    action: 'shell',
    what: 'pkg add left-pad',
    approval_key: `key-${id}`,
    reason_code: 'rule_ask',
    why: 'the padding helper',
    lane: 'standard',
    always,
    summary: 'Waiting for your approval: pkg add left-pad',
  },
  status: 'pending',
  asked_at: at(3),
  escalated_at: at(3),
  timeout_at: '9999-12-31T23:59:59.999Z',
  ...over,
});

const errorOf = (res: { body: unknown }) =>
  (res.body as { error: Record<string, unknown> }).error;

beforeEach(async () => {
  act.mockReset();
  ctx = await startCardRig({ actOnEscalation: act });
  await ctx.seed(
    [card(1, { phase: 'in_progress' })],
    [ticket(1, 1, { status: 'waiting_human' })],
  );

  await ctx.storage.transaction(async (tx) => {
    await tx.interactions.insert(
      permission('int-p1', {
        offered: true,
        rule: { action: 'shell', resource: 'pkg add left-pad' },
      }),
    );

    await tx.interactions.insert(
      permission('int-p2', {
        offered: false,
        why: 'A chain of commands is approved each time.',
      }),
    );
  });
});

afterEach(async () => {
  await ctx.rig.close();
});

describe('POST /interactions/:id/act on a tool approval', () => {
  const post = (body: unknown, id = 'int-p1') =>
    ctx.rig.json('POST', `/interactions/${id}/act`, body);

  it.each([
    [{ action: 'allow_once' }],
    [{ action: 'allow_always' }],
    [{ action: 'deny' }],
    [{ action: 'deny', note: 'use the stdlib instead' }],
  ])('passes %j to the engine as the owner', async (body) => {
    act.mockResolvedValue({ status: 'done', interaction: null });

    const res = await post(body);

    expect(res.status).toBe(200);
    expect(act).toHaveBeenCalledWith('int-p1', body, 'owner');
    expect(res.body).toMatchObject({
      escalation: {
        kind: 'permission',
        stage: 'owner',
        status: 'pending',
        actions: ['allow_once', 'allow_always', 'deny'],
      },
    });
  });

  it('offers no Always when the call has no narrow rule', async () => {
    act.mockResolvedValue({ status: 'done', interaction: null });

    const res = await post({ action: 'allow_once' }, 'int-p2');

    expect(res.body).toMatchObject({
      escalation: { actions: ['allow_once', 'deny'] },
    });
  });

  it('answers 409 not_pending to a second click and 409 action_not_offered to a refused one', async () => {
    act.mockResolvedValueOnce({ status: 'not_pending' });
    act.mockResolvedValueOnce({ status: 'action_not_offered' });

    expect(errorOf(await post({ action: 'allow_once' }))['code']).toBe('not_pending');
    expect(errorOf(await post({ action: 'allow_always' }, 'int-p2'))['code']).toBe(
      'action_not_offered',
    );
  });

  it.each([[{ action: 'allow' }], [{ action: 'deny', note: 'x'.repeat(1001) }]])(
    'refuses %j before asking the engine',
    async (body) => {
      const res = await post(body);

      expect(res.status).toBe(400);
      expect(errorOf(res)['code']).toBe('invalid_body');
      expect(act).not.toHaveBeenCalled();
    },
  );

  it('shows no actions once the owner has answered', async () => {
    await ctx.storage.transaction((tx) =>
      tx.interactions.answer('int-p1', { action: 'allow_once', by: 'owner' }, at(5)),
    );

    act.mockResolvedValue({ status: 'done', interaction: null });
    const res = await post({ action: 'allow_once' });

    expect(res.body).toMatchObject({
      escalation: {
        status: 'answered',
        actions: [],
        settled: { action: 'allow_once', by: 'owner' },
      },
    });
  });
});

describe('where the item shows', () => {
  it('lists pending tool approvals on the card with their actions', async () => {
    const res = await ctx.rig.json('GET', '/cards/FX-C1/escalations');

    const items = (
      res.body as { items: { id: string; kind: string; actions: string[] }[] }
    ).items;

    expect(items.map((i) => [i.id, i.kind, i.actions])).toEqual([
      ['int-p1', 'permission', ['allow_once', 'allow_always', 'deny']],
      ['int-p2', 'permission', ['allow_once', 'deny']],
    ]);
  });

  it('puts the exact call in the card Needs-you dock as a tool approval', async () => {
    const res = await ctx.rig.json('GET', '/cards/FX-C1');

    const dock = (
      res.body as {
        needs_you_detail: { kind: string; title: string; interaction_id?: string }[];
      }
    ).needs_you_detail;

    expect(dock).toContainEqual(
      expect.objectContaining({
        kind: 'tool_approval',
        title: 'Allow `pkg add left-pad`?',
        interaction_id: 'int-p1',
      }),
    );
  });
});
