/**
 * Contract cases for `cardRelations`, `cardReplyQueue` and `interactions.card_id`.
 *
 * Why: the card-first flow rests on three tables behaving the same in SQLite and in memory.
 *   Card dependencies are edges that the cycle check reads per project and an edit replaces
 *   in one step, so a refused edge must leave the old set intact and an edge may never point
 *   at its own card or at a card that does not exist. The Director's owed replies must be
 *   claimed by exactly one caller, survive a restart, and be taken again only once a claim
 *   is stale (d-0134), or an owner's message is lost or answered twice. A question can name
 *   the card it belongs to.
 *
 * Exports: describeCardFlowContract().
 * Depends on: vitest, @forge/core, helpers/fixtures. IO only through the adapter under test.
 */

import type { Card, CardId, StorageAdapter } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { T0, makeInteraction } from '#tests/helpers/fixtures.js';

const id = (n: number) => `SF-C${n}` as CardId;
const at = (minute: number) => `2026-10-13T00:${String(minute).padStart(2, '0')}:00.000Z`;

const card = (n: number, over: Partial<Card> = {}): Card => ({
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
  ...over,
});

const dep = (from: number, to: number) => ({
  from: id(from),
  to: id(to),
  kind: 'depends_on' as const,
});

/** Registers the cases; `getDb` returns the adapter the surrounding suite created for this test. */
export function describeCardFlowContract(getDb: () => StorageAdapter): void {
  const tx: StorageAdapter['transaction'] = (fn) => getDb().transaction(fn);

  const seedCards = (count: number, project = 'SF') =>
    tx(async (t) => {
      for (let n = 1; n <= count; n++) {
        await t.cards.insert(card(n, { project }));
      }
    });

  describe('cardRelations', () => {
    it('adds an edge once and lists it from either end', async () => {
      await seedCards(3);

      expect(await tx((t) => t.cardRelations.add(dep(1, 2), at(1)))).toBe(true);
      expect(await tx((t) => t.cardRelations.add(dep(1, 2), at(2)))).toBe(false);
      await tx((t) => t.cardRelations.add(dep(3, 1), at(3)));

      expect(await tx((t) => t.cardRelations.listFor(id(1)))).toEqual([
        dep(1, 2),
        dep(3, 1),
      ]);

      expect(await tx((t) => t.cardRelations.listFor(id(2)))).toEqual([dep(1, 2)]);
      expect(await tx((t) => t.cardRelations.listFor(id(3)))).toEqual([dep(3, 1)]);
    });

    it('refuses an edge from a card to itself and an edge to an unknown card', async () => {
      await seedCards(1);

      await expect(tx((t) => t.cardRelations.add(dep(1, 1), at(1)))).rejects.toThrow();
      await expect(tx((t) => t.cardRelations.add(dep(1, 9), at(1)))).rejects.toThrow();
      expect(await tx((t) => t.cardRelations.listFor(id(1)))).toEqual([]);
    });

    it('lists the edges of one project only, which is what the cycle check reads', async () => {
      await seedCards(2);
      await tx(async (t) => {
        await t.cards.insert(card(5, { project: 'OT', id: 'OT-C5' as CardId }));
        await t.cards.insert(card(6, { project: 'OT', id: 'OT-C6' as CardId }));
        await t.cardRelations.add(dep(1, 2), at(1));
        await t.cardRelations.add(
          { from: 'OT-C5' as CardId, to: 'OT-C6' as CardId, kind: 'depends_on' },
          at(1),
        );
      });

      expect(await tx((t) => t.cardRelations.listByProject('SF'))).toEqual([dep(1, 2)]);
      expect(await tx((t) => t.cardRelations.listByProject('OT'))).toHaveLength(1);
    });

    it('replaces every edge of one card and leaves the others', async () => {
      await seedCards(5);
      await tx(async (t) => {
        await t.cardRelations.add(dep(1, 2), at(1));
        await t.cardRelations.add(dep(3, 1), at(1));
        await t.cardRelations.add(dep(4, 5), at(1));
      });

      await tx((t) => t.cardRelations.replaceFor(id(1), [id(5)], [id(2)], at(2)));

      expect(await tx((t) => t.cardRelations.listFor(id(1)))).toEqual([
        dep(1, 5),
        dep(2, 1),
      ]);

      expect(await tx((t) => t.cardRelations.listByProject('SF'))).toEqual(
        expect.arrayContaining([dep(4, 5), dep(1, 5), dep(2, 1)]),
      );

      expect(await tx((t) => t.cardRelations.listByProject('SF'))).toHaveLength(3);
    });

    it('clears a card edges when both lists are empty', async () => {
      await seedCards(2);
      await tx((t) => t.cardRelations.add(dep(1, 2), at(1)));

      await tx((t) => t.cardRelations.replaceFor(id(1), [], [], at(2)));

      expect(await tx((t) => t.cardRelations.listFor(id(1)))).toEqual([]);
    });

    it('leaves the old edges when a replacement names itself or an unknown card', async () => {
      await seedCards(2);
      await tx((t) => t.cardRelations.add(dep(1, 2), at(1)));

      await expect(
        tx((t) => t.cardRelations.replaceFor(id(1), [id(1)], [], at(2))),
      ).rejects.toThrow();

      await expect(
        tx((t) => t.cardRelations.replaceFor(id(1), [id(9)], [], at(2))),
      ).rejects.toThrow();

      expect(await tx((t) => t.cardRelations.listFor(id(1)))).toEqual([dep(1, 2)]);
    });

    it('treats a card named in both lists as two edges of a loop, not as one', async () => {
      await seedCards(2);

      await tx((t) => t.cardRelations.replaceFor(id(1), [id(2)], [id(2)], at(1)));

      expect(await tx((t) => t.cardRelations.listFor(id(1)))).toEqual([
        dep(1, 2),
        dep(2, 1),
      ]);
    });
  });

  describe('cardReplyQueue', () => {
    const enqueue = (cardId: CardId, event: number, minute: number) =>
      tx((t) =>
        t.cardReplyQueue.enqueue({
          card_id: cardId,
          event_id: event,
          reason: event === 0 ? 'card_created' : 'user_message',
          enqueued_at: at(minute),
        }),
      );

    it('numbers rows in order and reports them open until completed', async () => {
      await seedCards(2);

      const a = await enqueue(id(1), 0, 1);
      const b = await enqueue(id(1), 1, 2);
      await enqueue(id(2), 0, 3);

      expect(b.id).toBeGreaterThan(a.id);
      expect(a).toMatchObject({ card_id: 'SF-C1', event_id: 0, reason: 'card_created' });
      expect(
        (await tx((t) => t.cardReplyQueue.listOpen(id(1)))).map((r) => r.id),
      ).toEqual([a.id, b.id]);

      expect(await tx((t) => t.cardReplyQueue.complete(a.id, at(5)))).toBe(true);
      expect(await tx((t) => t.cardReplyQueue.complete(a.id, at(6)))).toBe(false);
      expect(
        (await tx((t) => t.cardReplyQueue.listOpen(id(1)))).map((r) => r.id),
      ).toEqual([b.id]);
    });

    it('refuses to queue a reply for an unknown card', async () => {
      await expect(enqueue(id(9), 0, 1)).rejects.toThrow();
    });

    it('hands a row to one claimer: a second claim finds nothing while the first is fresh', async () => {
      await seedCards(1);
      const row = await enqueue(id(1), 0, 1);

      const first = await tx((t) => t.cardReplyQueue.claim(at(10), at(0)));
      const second = await tx((t) => t.cardReplyQueue.claim(at(11), at(0)));

      expect(first.map((r) => r.id)).toEqual([row.id]);
      expect(first[0]?.claimed_at).toBe(at(10));
      expect(second).toEqual([]);
    });

    it('takes a stale claim again (a process died mid-answer) but never a finished row', async () => {
      await seedCards(2);
      const stale = await enqueue(id(1), 0, 1);
      const finished = await enqueue(id(2), 0, 2);

      await tx((t) => t.cardReplyQueue.claim(at(10), at(0)));
      await tx((t) => t.cardReplyQueue.complete(finished.id, at(11)));

      const again = await tx((t) => t.cardReplyQueue.claim(at(40), at(30)));

      expect(again.map((r) => r.id)).toEqual([stale.id]);
      expect(again[0]?.claimed_at).toBe(at(40));
    });

    it('claims unclaimed rows oldest first', async () => {
      await seedCards(2);
      const a = await enqueue(id(2), 0, 1);
      const b = await enqueue(id(1), 0, 2);

      const claimed = await tx((t) => t.cardReplyQueue.claim(at(10), at(0)));

      expect(claimed.map((r) => r.id)).toEqual([a.id, b.id]);
    });

    it('keeps a queued row when the transaction that enqueued it rolls back', async () => {
      await seedCards(1);

      await expect(
        tx(async (t) => {
          await t.cardReplyQueue.enqueue({
            card_id: id(1),
            event_id: 0,
            reason: 'card_created',
            enqueued_at: at(1),
          });

          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');

      expect(await tx((t) => t.cardReplyQueue.listOpen(id(1)))).toEqual([]);
    });
  });

  describe('interactions and cards', () => {
    it('stores the card a question belongs to and reads it back, absent when none', async () => {
      await tx(async (t) => {
        await t.interactions.insert(makeInteraction('i-card', { card_id: id(1) }));
        await t.interactions.insert(makeInteraction('i-plain'));
      });

      expect((await tx((t) => t.interactions.get('i-card')))?.card_id).toBe('SF-C1');
      expect((await tx((t) => t.interactions.get('i-plain')))?.card_id).toBeUndefined();
    });
  });
}
