/**
 * `PATCH /cards/:id` against real in-memory storage.
 *
 * Why: a PATCH that could set the column would let the Board be moved by hand (d-0107), one
 *   that skipped the history would hide who retyped or dropped a request (d-0112), and one
 *   that reopened a closed card would quietly revive dropped work.
 *
 * Pins: type change and close with their events, actor and time; the type change recorded
 *   before the close; no event for an unchanged type; 409 for a closed card or a source the
 *   type refuses; 400 for an unknown type, a column, an empty body or a blank reason; 404.
 * Depends on: helpers/card-rig, vitest. IO: a loopback socket.
 */

import { GrillState } from '@forge/core';
import type { CardId } from '@forge/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { at, card, startCardRig, ticket } from '#tests/helpers/card-rig.js';
import type { CardRig } from '#tests/helpers/card-rig.js';

let ctx: CardRig;

const emptyGrill = () => GrillState.parse({});

const seed: CardRig['seed'] = (cards, tickets) => ctx.seed(cards, tickets);
const patch = (path: string, body: unknown) => ctx.rig.json('PATCH', path, body);

beforeEach(async () => {
  ctx = await startCardRig();
});

afterEach(async () => {
  await ctx.rig.close();
});

describe('PATCH /cards/:id', () => {
  const events = async () =>
    ctx.storage.transaction((tx) => tx.cardEvents.list('FX-C1' as CardId, { limit: 10 }));

  it('changes the type, records who and when, and keeps the history', async () => {
    await seed([card(1, { type: 'discussion' })]);

    const res = await patch('/cards/FX-C1', { type: 'issue' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 'FX-C1', type: 'issue', column: 'shaping' });
    expect((await events()).map((e) => [e.kind, e.payload, e.actor])).toEqual([
      [
        'type_changed',
        { from: 'discussion', to: 'issue' },
        { type: 'user', id: 'owner' },
      ],
    ]);

    const stored = await ctx.storage.transaction((tx) => tx.cards.get('FX-C1' as CardId));
    expect(stored?.updated_at).toBe(at(30));
  });

  it('closes with a reason, moving the card to closed whatever its tickets say', async () => {
    await seed([card(1)], [ticket(1, 1, { status: 'in_progress' })]);

    const res = await patch('/cards/FX-C1', { closed_reason: 'duplicate of FX-C4' });

    expect(res.body).toMatchObject({
      column: 'closed',
      closed_reason: 'duplicate of FX-C4',
    });

    expect((await events()).map((e) => e.kind)).toEqual(['card_closed']);
  });

  it('asks the engine to close the work of the card, once, only when closing', async () => {
    const closeCardWork = vi.fn(async () => []);
    await ctx.rig.close();
    ctx = await startCardRig({ closeCardWork });
    await seed([card(1), card(2)], [ticket(1, 1, { status: 'waiting_human' })]);

    await patch('/cards/FX-C2', { type: 'plan' });
    expect(closeCardWork).not.toHaveBeenCalled();

    await patch('/cards/FX-C1', { closed_reason: 'duplicate' });
    expect(closeCardWork).toHaveBeenCalledTimes(1);
    expect(closeCardWork).toHaveBeenCalledWith('FX-C1');
  });

  it('records the type change before the close when one request does both', async () => {
    await seed([card(1, { type: 'discussion' })]);

    await patch('/cards/FX-C1', { type: 'plan', closed_reason: 'dropped' });

    expect((await events()).map((e) => e.kind)).toEqual(['type_changed', 'card_closed']);
  });

  it('writes nothing when the type is already the asked one', async () => {
    await seed([card(1)]);

    const res = await patch('/cards/FX-C1', { type: 'issue' });

    expect(res.status).toBe(200);
    expect(await events()).toEqual([]);
  });

  it('refuses a closed card (409), an unknown type (400), a source the type refuses (409) and an unknown card (404)', async () => {
    await seed([
      card(1),
      card(2, { closed_reason: 'dup' }),
      card(3, { source: { kind: 'cron', ref: 'c' } }),
    ]);

    expect((await patch('/cards/FX-C2', { type: 'plan' })).status).toBe(409);
    expect((await patch('/cards/FX-C1', { type: 'epic' })).status).toBe(400);
    expect((await patch('/cards/FX-C3', { type: 'discussion' })).status).toBe(409);
    expect((await patch('/cards/FX-C9', { type: 'plan' })).status).toBe(404);
    expect(await events()).toEqual([]);
  });

  it('refuses a body that tries to set the column or says nothing', async () => {
    await seed([card(1)]);

    expect((await patch('/cards/FX-C1', { column: 'done' })).status).toBe(400);
    expect((await patch('/cards/FX-C1', {})).status).toBe(400);
    expect((await patch('/cards/FX-C1', { closed_reason: ' ' })).status).toBe(400);
    expect((await patch('/cards/nonsense', { type: 'plan' })).status).toBe(400);
  });

  describe('budget cap (d-0143)', () => {
    const capOf = async () =>
      (await ctx.storage.transaction((tx) => tx.cards.get('FX-C1' as CardId)))
        ?.budget_cap_usd;

    it('sets, changes and clears the cap, alone or with another field, and never blocks the card', async () => {
      await seed([card(1, { type: 'discussion' })]);

      const set = await patch('/cards/FX-C1', { budget_cap_usd: 5 });
      expect(set.status).toBe(200);
      expect(await capOf()).toBe(5);
      expect(set.body).toMatchObject({ budget_cap_usd: 5 });

      expect((await patch('/cards/FX-C1', { budget_cap_usd: 0 })).status).toBe(200);
      expect(await capOf()).toBe(0);

      const both = await patch('/cards/FX-C1', { type: 'issue', budget_cap_usd: 8.5 });
      expect(both.status).toBe(200);
      expect(await capOf()).toBe(8.5);
      expect((await events()).map((e) => e.kind)).toEqual(['type_changed']);

      expect((await patch('/cards/FX-C1', { budget_cap_usd: null })).status).toBe(200);
      expect(await capOf()).toBeUndefined();
    });

    it('warns at once when the new cap is already reached by the spend, once per cap', async () => {
      await seed([card(1)]);
      await ctx.storage.transaction((tx) =>
        tx.cardPlanning.update('FX-C1' as CardId, {
          grill: { ...emptyGrill(), director_spend_usd: 0.9 },
        }),
      );

      await patch('/cards/FX-C1', { budget_cap_usd: 1 });
      await patch('/cards/FX-C1', { budget_cap_usd: 1 });

      const warned = (await events()).filter((e) => e.kind === 'budget_warning');
      expect(warned.map((e) => e.payload)).toEqual([
        { threshold: 0.8, spent_usd: 0.9, cap_usd: 1 },
      ]);

      await patch('/cards/FX-C1', { budget_cap_usd: 1.1 });
      expect((await events()).filter((e) => e.kind === 'budget_warning')).toHaveLength(2);
    });

    it('refuses a negative or non-number cap (400) and a closed card (409)', async () => {
      await seed([card(1), card(2, { closed_reason: 'dup' })]);

      expect((await patch('/cards/FX-C1', { budget_cap_usd: -1 })).status).toBe(400);
      expect((await patch('/cards/FX-C1', { budget_cap_usd: 'lots' })).status).toBe(400);
      expect((await patch('/cards/FX-C2', { budget_cap_usd: 5 })).status).toBe(409);
      expect(await capOf()).toBeUndefined();
    });
  });
});
