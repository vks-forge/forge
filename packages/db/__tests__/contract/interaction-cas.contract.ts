/**
 * Contract cases for interaction answer/expire compare-and-swap and listByTicket.
 *
 * Why: a human answering a parked question and the timeout sweep can arrive in the same
 * tick, and so can two answers (two browser tabs). Exactly one may resolve the
 * interaction; the loser must learn it lost instead of overwriting the winner, or the
 * Director would resume a run with an answer nobody chose and report a different one in
 * the UI. `expire` also refuses to fire before the deadline, so a clock slip cannot kill
 * a question early (director-core.md §8).
 *
 * The same race exists between the Director's first look and the owner: `escalate` moves an
 * interaction from the Director's stage to the owner's (sets `escalated_at`) only while it is
 * pending and not yet escalated, so a late escalation cannot overwrite an answer, a second
 * escalation cannot move the date, and the card page can list what is open for its tickets.
 *
 * Exports: describeInteractionCasContract().
 * Depends on: vitest, helpers/fixtures. IO only through the adapter under test.
 */

import { describe, expect, it } from 'vitest';
import type { CardId, StorageAdapter } from '@forge/core';
import { makeInteraction } from '#tests/helpers/fixtures.js';

const ANSWERED = '2026-10-13T03:00:00.000Z';
const DUE = '2026-10-14T00:00:00.000Z';
const C1 = 'SF-C1' as CardId;
const C2 = 'SF-C2' as CardId;

/** Registers the cases; `getDb` returns the adapter the surrounding suite created for this test. */
export function describeInteractionCasContract(getDb: () => StorageAdapter): void {
  const tx: StorageAdapter['transaction'] = (fn) => getDb().transaction(fn);

  describe('interaction answer and expire (compare-and-swap)', () => {
    it('answer moves a pending interaction to answered once, storing answer and answered_at', async () => {
      await tx((t) => t.interactions.insert(makeInteraction('i1')));
      const won = await tx((t) =>
        t.interactions.answer('i1', { choice: 'sqlite' }, ANSWERED),
      );

      expect(won).toBe(true);
      expect(await tx((t) => t.interactions.get('i1'))).toMatchObject({
        status: 'answered',
        answer: { choice: 'sqlite' },
        answered_at: ANSWERED,
      });
    });

    it('a second answer loses and leaves the first answer in place', async () => {
      await tx((t) => t.interactions.insert(makeInteraction('i1')));
      await tx((t) => t.interactions.answer('i1', 'first', ANSWERED));
      const second = await tx((t) =>
        t.interactions.answer('i1', 'second', '2026-10-13T04:00:00.000Z'),
      );

      expect(second).toBe(false);
      expect(await tx((t) => t.interactions.get('i1'))).toMatchObject({
        answer: 'first',
        answered_at: ANSWERED,
      });
    });

    it('answer returns false for an unknown, cancelled or timed-out interaction', async () => {
      await tx(async (t) => {
        await t.interactions.insert(makeInteraction('c1', { status: 'cancelled' }));
        await t.interactions.insert(makeInteraction('t1', { status: 'timed_out' }));
      });

      const results = await tx(async (t) => [
        await t.interactions.answer('nope', 'x', ANSWERED),
        await t.interactions.answer('c1', 'x', ANSWERED),
        await t.interactions.answer('t1', 'x', ANSWERED),
      ]);

      expect(results).toEqual([false, false, false]);
      expect((await tx((t) => t.interactions.get('c1')))?.status).toBe('cancelled');
    });

    it('answer can store a null answer', async () => {
      await tx((t) => t.interactions.insert(makeInteraction('i1')));
      expect(await tx((t) => t.interactions.answer('i1', null, ANSWERED))).toBe(true);
      expect((await tx((t) => t.interactions.get('i1')))?.status).toBe('answered');
    });

    it('expire times out a due pending interaction and a later answer loses', async () => {
      await tx((t) => t.interactions.insert(makeInteraction('i1')));
      const expired = await tx((t) => t.interactions.expire('i1', DUE));
      const late = await tx((t) => t.interactions.answer('i1', 'too late', DUE));
      expect([expired, late]).toEqual([true, false]);
      expect(await tx((t) => t.interactions.get('i1'))).toMatchObject({
        status: 'timed_out',
      });

      expect('answer' in ((await tx((t) => t.interactions.get('i1'))) ?? {})).toBe(false);
    });

    it('expire does nothing before timeout_at, and not for an answered or unknown interaction', async () => {
      await tx(async (t) => {
        await t.interactions.insert(makeInteraction('i1'));
        await t.interactions.insert(makeInteraction('i2'));
        await t.interactions.answer('i2', 'x', ANSWERED);
      });

      const results = await tx(async (t) => [
        await t.interactions.expire('i1', '2026-10-13T12:00:00.000Z'),
        await t.interactions.expire('i2', DUE),
        await t.interactions.expire('nope', DUE),
      ]);

      expect(results).toEqual([false, false, false]);
      expect((await tx((t) => t.interactions.get('i1')))?.status).toBe('pending');
      expect((await tx((t) => t.interactions.get('i2')))?.status).toBe('answered');
    });

    it('an answer racing an expire has exactly one winner', async () => {
      await tx((t) => t.interactions.insert(makeInteraction('i1')));
      const [a, e] = await Promise.all([
        getDb().transaction((t) => t.interactions.answer('i1', 'a', DUE)),
        getDb().transaction((t) => t.interactions.expire('i1', DUE)),
      ]);

      expect([a, e].filter(Boolean)).toHaveLength(1);
      const status = (await tx((t) => t.interactions.get('i1')))?.status;
      expect(status).toBe(a ? 'answered' : 'timed_out');
    });

    it('stores the blocked kind', async () => {
      await tx((t) => t.interactions.insert(makeInteraction('i1', { kind: 'blocked' })));
      expect((await tx((t) => t.interactions.get('i1')))?.kind).toBe('blocked');
    });
  });

  describe('interactions listByTicket', () => {
    it('returns every status for the ticket in asked order, and none for other tickets', async () => {
      await tx(async (t) => {
        await t.interactions.insert(
          makeInteraction('i2', { asked_at: '2026-10-13T02:00:00.000Z' }),
        );

        await t.interactions.insert(makeInteraction('i1'));
        await t.interactions.insert(makeInteraction('i3', { status: 'cancelled' }));
        await t.interactions.insert(makeInteraction('i4', { ticket_id: 'SF-2' }));
      });

      const list = await tx((t) => t.interactions.listByTicket('SF-1'));
      expect(list.map((i) => i.id)).toEqual(['i1', 'i3', 'i2']);
      expect(await tx((t) => t.interactions.listByTicket('SF-9'))).toEqual([]);
    });
  });

  describe('interaction escalate (compare-and-swap)', () => {
    const ESCALATED = '2026-10-13T01:00:00.000Z';
    const payload = {
      kind: 'question',
      text: 'Which database?',
      source: 'ask_director',
      options: [],
    };

    it('moves a pending interaction to the owner stage once, replacing the payload', async () => {
      await tx((t) => t.interactions.insert(makeInteraction('i1')));
      const won = await tx((t) =>
        t.interactions.escalate('i1', { payload, escalated_at: ESCALATED }, ESCALATED),
      );

      expect(won).toBe(true);
      expect(await tx((t) => t.interactions.get('i1'))).toMatchObject({
        status: 'pending',
        escalated_at: ESCALATED,
        payload,
      });
    });

    it('loses when it was already escalated, answered, timed out or is unknown', async () => {
      await tx(async (t) => {
        await t.interactions.insert(makeInteraction('e1', { escalated_at: ESCALATED }));
        await t.interactions.insert(makeInteraction('a1'));
        await t.interactions.answer('a1', 'x', ESCALATED);
        await t.interactions.insert(makeInteraction('t1', { status: 'timed_out' }));
      });

      const results = await tx(async (t) => [
        await t.interactions.escalate('e1', { payload, escalated_at: DUE }, DUE),
        await t.interactions.escalate('a1', { payload, escalated_at: DUE }, DUE),
        await t.interactions.escalate('t1', { payload, escalated_at: DUE }, DUE),
        await t.interactions.escalate('nope', { payload, escalated_at: DUE }, DUE),
      ]);

      expect(results).toEqual([false, false, false, false]);
      expect((await tx((t) => t.interactions.get('e1')))?.escalated_at).toBe(ESCALATED);
      expect((await tx((t) => t.interactions.get('a1')))?.payload).toEqual({
        prompt: 'which db?',
      });
    });

    it('an answer racing an escalation has exactly one winner and an answer is never overwritten', async () => {
      await tx((t) => t.interactions.insert(makeInteraction('i1')));
      const [a, e] = await Promise.all([
        getDb().transaction((t) => t.interactions.answer('i1', 'a', DUE)),
        getDb().transaction((t) =>
          t.interactions.escalate('i1', { payload, escalated_at: DUE }, DUE),
        ),
      ]);

      const row = await tx((t) => t.interactions.get('i1'));
      if (a) {
        expect(row?.status).toBe('answered');
        expect(e).toBe(false);
      } else {
        // Escalating first leaves the row pending: the answer then wins on the next call.
        expect(e).toBe(true);
        expect(row?.status).toBe('pending');
      }
    });

    it('an answered interaction still reads back its escalated_at', async () => {
      await tx((t) => t.interactions.insert(makeInteraction('i1')));
      await tx((t) =>
        t.interactions.escalate('i1', { payload, escalated_at: ESCALATED }, ESCALATED),
      );

      await tx((t) => t.interactions.answer('i1', 'x', DUE));
      expect(await tx((t) => t.interactions.get('i1'))).toMatchObject({
        status: 'answered',
        escalated_at: ESCALATED,
      });
    });
  });

  describe('interactions listPendingByCard', () => {
    it('returns only the pending interactions of that card, in asked order', async () => {
      await tx(async (t) => {
        await t.interactions.insert(
          makeInteraction('i2', { card_id: C1, asked_at: '2026-10-13T02:00:00.000Z' }),
        );

        await t.interactions.insert(makeInteraction('i1', { card_id: C1 }));
        await t.interactions.insert(
          makeInteraction('i3', { card_id: C1, status: 'cancelled' }),
        );

        await t.interactions.insert(makeInteraction('i4', { card_id: C2 }));
        await t.interactions.insert(makeInteraction('i5'));
      });

      const rows = await tx((t) => t.interactions.listPendingByCard('SF-C1'));

      expect(rows.map((i) => i.id)).toEqual(['i1', 'i2']);
      expect(await tx((t) => t.interactions.listPendingByCard('SF-C9'))).toEqual([]);
    });
  });
}
