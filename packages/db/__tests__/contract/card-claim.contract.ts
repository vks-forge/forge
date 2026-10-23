/**
 * Contract cases for the card reply queue's claim options and `releaseClaims()`.
 *
 * Why: the Director answers several cards at once, each turn holding one slot. A claim that took
 *   every open row would mark rows of cards with no free slot as claimed and strand them for the
 *   whole stale window, and would hand a card with a turn in flight to a second caller. After a
 *   restart, rows claimed by the dead process must be answered at once, not ten minutes later.
 *   SQLite and the in-memory queue must choose the same cards or an engine test passes against
 *   behaviour production lacks.
 *
 * Exports: describeCardClaimContract().
 * Depends on: vitest, @forge/core, helpers/fixtures. IO only through the adapter under test.
 */

import type { Card, CardId, CardReplyReason, StorageAdapter } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { T0 } from '#tests/helpers/fixtures.js';

const id = (n: number) => `SF-C${n}` as CardId;
const at = (minute: number) => `2026-10-13T00:${String(minute).padStart(2, '0')}:00.000Z`;

const card = (n: number): Card => ({
  id: id(n),
  project: 'SF',
  type: 'issue',
  title: `Card ${n}`,
  summary: 'summary',
  source: { kind: 'chat', ref: `msg-${n}` },
  created_by: { type: 'user', id: 'u1' },
  created_at: T0,
  updated_at: T0,
  phase: 'grilling',
  phase_version: 0,
  needs_you: false,
  priority: 'normal',
  links: [],
});

/** Registers the cases; `getDb` returns the adapter the surrounding suite created for this test. */
export function describeCardClaimContract(getDb: () => StorageAdapter): void {
  const tx: StorageAdapter['transaction'] = (fn) => getDb().transaction(fn);

  const seed = (count: number) =>
    tx(async (t) => {
      for (let n = 1; n <= count; n++) {
        await t.cards.insert(card(n));
      }
    });

  const enqueue = (n: number, reason: CardReplyReason, minute: number) =>
    tx((t) =>
      t.cardReplyQueue.enqueue({
        card_id: id(n),
        event_id: reason === 'user_message' ? minute : 0,
        reason,
        enqueued_at: at(minute),
      }),
    );

  const claim = (options?: { exclude?: CardId[]; maxCards?: number }) =>
    tx((t) => t.cardReplyQueue.claim(at(10), at(0), options));

  describe('cardReplyQueue claim options', () => {
    it('never claims a card in `exclude` and leaves its rows unclaimed', async () => {
      await seed(2);
      const busy = await enqueue(1, 'card_created', 1);
      const free = await enqueue(2, 'card_created', 2);

      const claimed = await claim({ exclude: [id(1)] });

      expect(claimed.map((r) => r.id)).toEqual([free.id]);
      expect(await claim()).toEqual([expect.objectContaining({ id: busy.id })]);
    });

    it('takes at most `maxCards` cards, all rows of each, and leaves the rest unclaimed', async () => {
      await seed(3);
      const a1 = await enqueue(1, 'card_created', 1);
      const b = await enqueue(2, 'card_created', 2);
      const a2 = await enqueue(1, 'user_message', 3);
      const c = await enqueue(3, 'card_created', 4);

      const first = await claim({ maxCards: 2 });
      const rest = await claim();

      expect(first.map((r) => r.id)).toEqual([a1.id, b.id, a2.id]);
      expect(rest.map((r) => r.id)).toEqual([c.id]);
    });

    it('serves a card with an owner message waiting before older cards without one', async () => {
      await seed(3);
      await enqueue(1, 'card_created', 1);
      await enqueue(2, 'start_planning', 2);
      const owner = await enqueue(3, 'user_message', 3);

      const claimed = await claim({ maxCards: 1 });

      expect(claimed.map((r) => r.id)).toEqual([owner.id]);
    });

    it('treats maxCards 0 as no free slot: nothing is claimed', async () => {
      await seed(1);
      await enqueue(1, 'card_created', 1);

      expect(await claim({ maxCards: 0 })).toEqual([]);
      expect(await claim()).toHaveLength(1);
    });
  });

  describe('cardReplyQueue releaseClaims', () => {
    it('makes claimed unfinished rows claimable at once, whatever the stale cutoff', async () => {
      await seed(2);
      const held = await enqueue(1, 'card_created', 1);
      const finished = await enqueue(2, 'card_created', 2);
      await tx((t) => t.cardReplyQueue.claim(at(10), at(0)));
      await tx((t) => t.cardReplyQueue.complete(finished.id, at(11)));

      expect(await claim()).toEqual([]);
      expect(await tx((t) => t.cardReplyQueue.releaseClaims())).toBe(1);

      const again = await tx((t) => t.cardReplyQueue.claim(at(12), at(0)));
      expect(again.map((r) => r.id)).toEqual([held.id]);
      expect(again[0]?.claimed_at).toBe(at(12));
    });

    it('releases nothing when no row is claimed and keeps rows open', async () => {
      await seed(1);
      await enqueue(1, 'card_created', 1);

      expect(await tx((t) => t.cardReplyQueue.releaseClaims())).toBe(0);
      expect(await tx((t) => t.cardReplyQueue.listOpen(id(1)))).toHaveLength(1);
    });
  });
}
