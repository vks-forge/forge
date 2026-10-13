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
 * Exports: describeInteractionCasContract().
 * Depends on: vitest, helpers/fixtures. IO only through the adapter under test.
 */

import { describe, expect, it } from 'vitest';
import type { StorageAdapter } from '@forge/core';
import { makeInteraction } from '#tests/helpers/fixtures.js';

const ANSWERED = '2026-10-13T03:00:00.000Z';
const DUE = '2026-10-14T00:00:00.000Z';

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
}
