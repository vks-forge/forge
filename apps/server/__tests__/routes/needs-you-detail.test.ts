/**
 * The current needs-you items on the card and ticket details.
 *
 * Why: the dock above the composer must show what waits on the owner even when the browser
 *   loaded only the newest slice of a long history, and must clear the moment the owner
 *   answers. So the server reads the event log and the pending escalations itself and sends
 *   the current items with the detail; a raise that was answered, a closed card, or an
 *   escalation the Director still holds must never appear, and a settled one must go away.
 *
 * Pins: `GET /cards/:id` carrying `needs_you_detail` (a structured raise, an old raise without
 *   the new fields, nothing once settled or closed, an owner escalation after it, none while
 *   the Director holds it, and the raise found behind more than one page of newer events);
 *   `GET /tickets/:id` carrying the ticket's escalations and its review wait, cleared by an answer.
 * Depends on: helpers/card-rig, vitest. IO: a loopback socket.
 */

import type { CardId, Interaction, NewCardEvent } from '@forge/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { at, card, startCardRig, ticket } from '#tests/helpers/card-rig.js';
import type { CardRig } from '#tests/helpers/card-rig.js';

let ctx: CardRig;
const CARD = 'FX-C1' as CardId;
const actor = { type: 'director', id: 'engine' } as const;

type Item = {
  kind: string;
  title: string;
  items: string[];
  actions: string[];
  seq: number | null;
  ticket_id?: string;
  interaction_id?: string;
};
const itemsOf = (res: { body: unknown }) =>
  (res.body as { needs_you_detail: Item[] }).needs_you_detail;

const append = (event: Omit<NewCardEvent, 'at' | 'actor'>, cardId = CARD) =>
  ctx.storage.transaction((tx) =>
    tx.cardEvents.append(cardId, { ...event, at: at(5), actor } as NewCardEvent),
  );

const raiseApproval = (cardId = CARD) =>
  append(
    {
      kind: 'needs_you',
      payload: {
        reason: 'The plan needs your approval: a; b.',
        actions: ['approve_plan', 'request_changes'],
        kind: 'plan_approval',
        title: 'The plan needs your approval',
        items: ['a', 'b'],
      },
    },
    cardId,
  );

const failure = (over: Partial<Interaction> = {}): Interaction => ({
  id: 'int-f1',
  ticket_id: 'FX-1',
  card_id: CARD,
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
    [card(1, { phase: 'plan_ready', needs_you: true })],
    [ticket(1, 1, { status: 'waiting_human' })],
  );
});

afterEach(async () => {
  await ctx.rig.close();
});

describe('GET /cards/:id needs_you_detail', () => {
  const get = () => ctx.rig.json('GET', `/cards/${CARD}`);

  it('carries the open raise with its kind, title, items and actions', async () => {
    const raised = await raiseApproval();

    const items = itemsOf(await get());

    expect(items).toEqual([
      expect.objectContaining({
        kind: 'plan_approval',
        title: 'The plan needs your approval',
        items: ['a', 'b'],
        actions: ['approve_plan', 'request_changes'],
        seq: raised.seq,
      }),
    ]);
  });

  it('describes an old raise written before the structured fields', async () => {
    await append({
      kind: 'needs_you',
      payload: { reason: 'The Director has a question for you.', actions: ['answer'] },
    });

    expect(itemsOf(await get())).toMatchObject([
      {
        kind: 'director_questions',
        items: ['The Director has a question for you.'],
        actions: ['answer'],
      },
    ]);
  });

  it('is empty once the owner approved, even though the raise is in the log', async () => {
    await raiseApproval();
    await append({
      kind: 'plan_approved',
      payload: { version: 1, by: 'owner', ticket_ids: [] },
    });

    await ctx.storage.transaction((tx) =>
      tx.cards.updatePhase(CARD, 0, {
        phase: 'approved',
        needs_you: false,
        updated_at: at(6),
      }),
    );

    expect(itemsOf(await get())).toEqual([]);
  });

  it('finds the raise behind more events than one page holds', async () => {
    await raiseApproval();
    for (let i = 0; i < 130; i += 1) {
      await append({ kind: 'note', payload: { text: `note ${i}` } });
    }

    expect(itemsOf(await get())).toHaveLength(1);
  });

  it('is empty for a closed card', async () => {
    const closed = 'FX-C2' as CardId;
    await ctx.seed([
      card(2, { phase: 'closed', needs_you: true, closed_reason: 'not needed' }),
    ]);

    await raiseApproval(closed);

    expect(itemsOf(await ctx.rig.json('GET', `/cards/${closed}`))).toEqual([]);
  });

  it('lists an owner escalation after the raise, and drops it once answered', async () => {
    await raiseApproval();
    await ctx.storage.transaction((tx) => tx.interactions.insert(failure()));

    const before = itemsOf(await get());
    expect(before.map((i) => i.kind)).toEqual(['plan_approval', 'ticket_escalation']);
    expect(before[1]).toMatchObject({
      ticket_id: 'FX-1',
      interaction_id: 'int-f1',
      items: ['crash: failed 2 times'],
      seq: null,
    });

    await ctx.storage.transaction((tx) =>
      tx.interactions.answer('int-f1', { action: 'retry', by: 'owner' }, at(7)),
    );

    expect(itemsOf(await get()).map((i) => i.kind)).toEqual(['plan_approval']);
  });

  it('does not list an escalation the Director still holds', async () => {
    const { escalated_at: _held, ...held } = failure();
    void _held;
    await ctx.storage.transaction((tx) => tx.interactions.insert(held));

    expect(itemsOf(await get())).toEqual([]);
  });
});

describe('GET /tickets/:id needs_you_detail', () => {
  const get = (id: string) => ctx.rig.json('GET', `/tickets/${id}`);

  it('carries the ticket escalation and clears after the answer', async () => {
    await ctx.storage.transaction((tx) => tx.interactions.insert(failure()));

    const before = itemsOf(await get('FX-1'));
    expect(before).toMatchObject([
      {
        kind: 'ticket_escalation',
        ticket_id: 'FX-1',
        interaction_id: 'int-f1',
        actions: ['retry', 'replan', 'cancel'],
      },
    ]);

    await ctx.storage.transaction((tx) =>
      tx.interactions.answer('int-f1', { action: 'retry', by: 'owner' }, at(7)),
    );

    expect(itemsOf(await get('FX-1'))).toEqual([]);
  });

  it('carries a review item for finished work and none for a ticket that is merely planned', async () => {
    await ctx.seed(
      [card(2)],
      [ticket(2, 2, { status: 'review' }), ticket(3, 2, { status: 'planned' })],
    );

    expect(itemsOf(await get('FX-2'))).toMatchObject([
      { kind: 'ticket_review', actions: ['approve', 'rework', 'cancel'], seq: null },
    ]);

    expect(itemsOf(await get('FX-3'))).toEqual([]);
  });
});
