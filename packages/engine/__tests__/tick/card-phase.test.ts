/**
 * Tests for the engine's card phase door and how a card follows its tickets.
 *
 * Why: a card's phase decides what the Director may do and what the owner sees, so every
 *   change must pass `transitionCard()` with a compare-and-swap, and a card that runs work
 *   must not stay "in progress" after its last ticket merged, nor "queued" after its first
 *   one started. A refusal must report why instead of throwing, so one stale writer cannot
 *   crash a tick.
 *
 * Pins: moveCardTx applies a legal event and bumps the version; refuses an illegal event, an
 *   unknown card and leaves the stored card unchanged; syncCardWithTickets starts a queued or
 *   approved card with the first ticket past the inbox, completes it with the last live
 *   ticket done, ignores cancelled tickets, and does nothing for a card without live tickets
 *   or in another phase.
 * Depends on: src/tick/card-phase, @forge/db (memory storage fake), @forge/core, vitest.
 */

import type { Card, CardId, Ticket } from '@forge/core';
import { createMemoryStorage } from '@forge/db';
import { describe, expect, it } from 'vitest';
import { moveCardTx, syncCardWithTickets } from '#/tick/card-phase.js';

const T = '2026-10-16T00:00:00.000Z';
const L = '2026-10-16T01:00:00.000Z';
const C1 = 'FG-C1' as CardId;

const card = (phase: Card['phase'], over: Partial<Card> = {}): Card => ({
  id: C1,
  project: 'forge',
  type: 'plan',
  title: 'T',
  summary: 's',
  source: { kind: 'chat', ref: 'k' },
  created_by: { type: 'user', id: 'u' },
  created_at: T,
  updated_at: T,
  phase,
  phase_version: 0,
  needs_you: false,
  priority: 'normal',
  links: [],
  ...over,
});

const ticket = (n: number, status: Ticket['status']): Ticket => ({
  id: `FG-${n}` as Ticket['id'],
  project: 'forge',
  card_id: C1,
  title: `t${n}`,
  body: 'b',
  type: 'feat',
  lane: 'express',
  tier_predicted: 'A',
  status,
  status_version: 0,
  rework_count: 0,
  priority: 0,
  created_at: T,
  updated_at: T,
  blocked_by: [],
});

async function seeded(phase: Card['phase'], statuses: Ticket['status'][]) {
  const storage = createMemoryStorage();
  await storage.transaction(async (tx) => {
    await tx.cards.insert(card(phase));
    for (const [i, status] of statuses.entries()) {
      await tx.tickets.insert(ticket(i + 1, status));
    }
  });

  return storage;
}

const phaseOf = (storage: Awaited<ReturnType<typeof seeded>>) =>
  storage.transaction(async (tx) => (await tx.cards.get(C1))?.phase);

describe('moveCardTx', () => {
  it('applies a legal event, stores the next phase with a bumped version and the clock', async () => {
    const storage = await seeded('grilling', []);

    const moved = await storage.transaction((tx) =>
      moveCardTx(tx, C1, { type: 'plan_written' }, L),
    );

    expect(moved).toMatchObject({
      ok: true,
      card: { phase: 'plan_ready', phase_version: 1, updated_at: L },
    });

    const stored = await storage.transaction((tx) => tx.cards.get(C1));
    expect(stored).toMatchObject({
      phase: 'plan_ready',
      phase_version: 1,
      updated_at: L,
    });
  });

  it('refuses an illegal event with the reason and leaves the card as it was', async () => {
    const storage = await seeded('grilling', []);

    const moved = await storage.transaction((tx) =>
      moveCardTx(tx, C1, { type: 'approve' }, L),
    );

    expect(moved).toEqual({
      ok: false,
      reason: expect.stringContaining('illegal_transition'),
    });

    expect(await storage.transaction((tx) => tx.cards.get(C1))).toMatchObject({
      phase: 'grilling',
      phase_version: 0,
      updated_at: T,
    });
  });

  it('refuses an unknown card without throwing', async () => {
    const storage = createMemoryStorage();

    const moved = await storage.transaction((tx) =>
      moveCardTx(tx, 'FG-C9' as CardId, { type: 'close' }, L),
    );

    expect(moved).toEqual({ ok: false, reason: 'unknown card FG-C9' });
  });

  it('sets and clears the needs_you flag through the same door', async () => {
    const storage = await seeded('grilling', []);

    await storage.transaction((tx) => moveCardTx(tx, C1, { type: 'needs_you_set' }, L));
    const set = await storage.transaction((tx) => tx.cards.get(C1));
    await storage.transaction((tx) =>
      moveCardTx(tx, C1, { type: 'needs_you_cleared' }, L),
    );

    const cleared = await storage.transaction((tx) => tx.cards.get(C1));

    expect(set).toMatchObject({ needs_you: true, phase_version: 1 });
    expect(cleared).toMatchObject({ needs_you: false, phase_version: 2 });
  });
});

describe('syncCardWithTickets', () => {
  const sync = (storage: Awaited<ReturnType<typeof seeded>>) =>
    storage.transaction((tx) => syncCardWithTickets(tx, C1, L));

  it.each(['queued', 'approved'] as const)(
    'starts a %s card once a live ticket is past the inbox',
    async (phase) => {
      const storage = await seeded(phase, ['inbox', 'planned']);

      await sync(storage);

      expect(await phaseOf(storage)).toBe('in_progress');
    },
  );

  it('leaves a queued card queued while every ticket is still in the inbox', async () => {
    const storage = await seeded('queued', ['inbox', 'inbox']);

    await sync(storage);

    expect(await phaseOf(storage)).toBe('queued');
  });

  it('completes an in_progress card when every live ticket is done, ignoring cancelled ones', async () => {
    const storage = await seeded('in_progress', ['done', 'cancelled', 'done']);

    await sync(storage);

    expect(await phaseOf(storage)).toBe('done');
  });

  it('starts and completes in one step when the only ticket is already done', async () => {
    const storage = await seeded('queued', ['done']);

    await sync(storage);

    expect(await phaseOf(storage)).toBe('done');
  });

  it('keeps a card in_progress while any live ticket is unfinished', async () => {
    const storage = await seeded('in_progress', ['done', 'verifying']);

    await sync(storage);

    expect(await phaseOf(storage)).toBe('in_progress');
  });

  it.each(['grilling', 'plan_ready', 'closed', 'done'] as const)(
    'does not move a %s card whatever its tickets do',
    async (phase) => {
      const storage = await seeded(phase, ['done']);

      await sync(storage);

      expect(await phaseOf(storage)).toBe(phase);
    },
  );

  it('does nothing for a card without live tickets or without a card id', async () => {
    const storage = await seeded('queued', ['cancelled']);

    await sync(storage);
    await storage.transaction((tx) => syncCardWithTickets(tx, undefined, L));

    expect(await phaseOf(storage)).toBe('queued');
  });
});
