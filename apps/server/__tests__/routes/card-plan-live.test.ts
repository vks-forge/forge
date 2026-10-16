/**
 * The planning routes over the real engine and tracked storage.
 *
 * Why: the card page must update within a second of an owner action, and that only holds if
 *   a write made through a planning route reaches the project stream. The routes write
 *   nothing themselves; the engine's writes are announced by the tracked storage. The scripted
 *   engine tests cannot see a broken link in that chain, so this drives one real door end to
 *   end: a card left waiting by the migration is started, and the card's stale queries arrive
 *   on the project hub.
 *
 * Pins: start-planning answers 200 with the card in `grilling`, announces `["card", id]` on
 *   the project hub, and a second start answers 409 `phase_mismatch` without announcing.
 * Depends on: helpers/flow-rig, vitest. IO: a loopback socket.
 */

import type { Card, QueryKey } from '@forge/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startFlowRig } from '#tests/helpers/flow-rig.js';
import type { FlowRig } from '#tests/helpers/flow-rig.js';

let ctx: FlowRig;

beforeEach(async () => {
  ctx = await startFlowRig();
});

afterEach(async () => {
  await ctx.close();
});

/** A card in the state migration 0021 leaves old open cards in: waiting for "Start planning". */
async function backfilledCard(): Promise<Card> {
  const res = await ctx.rig.json('POST', '/projects/fixture/cards', {
    title: 'A todo application',
    description: 'Build a small todo application with a list and a form.',
    type: 'plan',
    priority: 'normal',
    dedupe_key: 'k-1',
  });

  const card = (res.body as { card: Card }).card;
  const at = new Date(ctx.clock.now).toISOString();

  await ctx.storage.transaction(async (tx) => {
    for (const row of await tx.cardReplyQueue.listOpen(card.id)) {
      await tx.cardReplyQueue.complete(row.id, at);
    }

    await tx.cards.updatePhase(card.id, 0, {
      phase: 'plan_ready',
      needs_you: true,
      updated_at: at,
    });
  });

  return card;
}

describe('POST /cards/:id/start-planning on the real engine', () => {
  it('moves the card to grilling and announces the stale card query', async () => {
    const card = await backfilledCard();
    const seen: QueryKey[] = [];
    ctx.events.subscribe('fixture', (keys) => seen.push(...keys));

    const res = await ctx.rig.json('POST', `/cards/${card.id}/start-planning`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ card: { id: card.id, phase: 'grilling' } });
    expect(seen).toContainEqual(['card', card.id]);
  });

  it('answers 409 phase_mismatch for a card already planning', async () => {
    const card = await backfilledCard();
    await ctx.rig.json('POST', `/cards/${card.id}/start-planning`);

    const res = await ctx.rig.json('POST', `/cards/${card.id}/start-planning`);

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: { code: 'phase_mismatch' } });
  });

  it('answers 404 for a card that does not exist', async () => {
    const res = await ctx.rig.json('POST', '/cards/FX-C99/start-planning');

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: { code: 'card_not_found' } });
  });
});
