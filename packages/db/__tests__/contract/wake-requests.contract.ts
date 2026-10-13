/**
 * Contract cases for the wake request queue.
 *
 * Why: the Director must wake a ticket exactly once per cause even when the trigger is
 * redelivered, must not wake it before its `not_before`, and must be able to count recent
 * recovery wakes to enforce the re-wake cap (at most three per ticket per hour). Without
 * the dedupe a rejected `done` run is re-woken in a loop; without `countSince` the loop
 * has no brake (director-core.md §3).
 *
 * Exports: describeWakeRequestsContract().
 * Depends on: vitest, helpers/fixtures. IO only through the adapter under test.
 */

import { describe, expect, it } from 'vitest';
import type { StorageAdapter } from '@forge/core';
import { T0, makeWake } from '#tests/helpers/fixtures.js';

const HOUR = 3_600_000;
const at = (offsetMs: number): string =>
  new Date(Date.parse(T0) + offsetMs).toISOString();

/** Registers the cases; `getDb` returns the adapter the surrounding suite created for this test. */
export function describeWakeRequestsContract(getDb: () => StorageAdapter): void {
  const tx: StorageAdapter['transaction'] = (fn) => getDb().transaction(fn);

  describe('wake requests', () => {
    it('stores a new request as pending with a zero coalesced count', async () => {
      const r = await tx((t) =>
        t.wakeRequests.insertIfNew(makeWake('k1', { not_before: at(HOUR) })),
      );

      expect(r.inserted).toBe(true);
      expect(r.request).toEqual({
        ...makeWake('k1', { not_before: at(HOUR) }),
        status: 'pending',
        coalesced_count: 0,
      });
    });

    it('coalesces a duplicate (ticket, reason, key): no new row, the stored count goes up', async () => {
      const first = await tx((t) => t.wakeRequests.insertIfNew(makeWake('k1')));
      const dup1 = await tx((t) =>
        t.wakeRequests.insertIfNew(
          makeWake('k1', { id: 'other-id', created_at: at(HOUR) }),
        ),
      );

      const dup2 = await tx((t) => t.wakeRequests.insertIfNew(makeWake('k1')));
      expect([dup1.inserted, dup2.inserted]).toEqual([false, false]);
      expect(dup1.request).toMatchObject({ id: first.request.id, coalesced_count: 1 });
      expect(dup2.request).toMatchObject({ id: first.request.id, coalesced_count: 2 });
      expect(dup2.request.created_at).toBe(T0);
      expect(await tx((t) => t.wakeRequests.listDue(at(HOUR)))).toHaveLength(1);
    });

    it('a different key, reason or ticket is a new request', async () => {
      const results = await tx(async (t) => [
        await t.wakeRequests.insertIfNew(makeWake('k1')),
        await t.wakeRequests.insertIfNew(makeWake('k2')),
        await t.wakeRequests.insertIfNew(
          makeWake('k1', { id: 'w-r', reason: 'answered' }),
        ),
        await t.wakeRequests.insertIfNew(
          makeWake('k1', { id: 'w-t', ticket_id: 'SF-2' }),
        ),
      ]);

      expect(results.map((r) => r.inserted)).toEqual([true, true, true, true]);
    });

    it('listDue returns pending requests whose not_before has passed or is absent, oldest first', async () => {
      await tx(async (t) => {
        await t.wakeRequests.insertIfNew(makeWake('later', { not_before: at(2 * HOUR) }));
        await t.wakeRequests.insertIfNew(makeWake('now'));
        await t.wakeRequests.insertIfNew(makeWake('past', { not_before: at(-HOUR) }));
        await t.wakeRequests.insertIfNew(makeWake('edge', { not_before: at(HOUR) }));
      });

      const due = await tx((t) => t.wakeRequests.listDue(at(HOUR)));
      expect(due.map((r) => r.idempotency_key)).toEqual(['now', 'past', 'edge']);
    });

    it('markConsumed consumes a pending request once and listDue stops returning it', async () => {
      await tx((t) => t.wakeRequests.insertIfNew(makeWake('k1')));
      const first = await tx((t) => t.wakeRequests.markConsumed('w-k1', at(HOUR)));
      const again = await tx((t) => t.wakeRequests.markConsumed('w-k1', at(2 * HOUR)));
      const unknown = await tx((t) => t.wakeRequests.markConsumed('nope', at(HOUR)));
      expect([first, again, unknown]).toEqual([true, false, false]);
      expect(await tx((t) => t.wakeRequests.listDue(at(3 * HOUR)))).toEqual([]);
      const dup = await tx((t) => t.wakeRequests.insertIfNew(makeWake('k1')));
      expect(dup.request).toMatchObject({
        status: 'consumed',
        consumed_at: at(HOUR),
        coalesced_count: 1,
      });
    });

    it('countSince counts requests created at or after the cut-off for one ticket', async () => {
      await tx(async (t) => {
        await t.wakeRequests.insertIfNew(makeWake('old', { created_at: at(-2 * HOUR) }));
        await t.wakeRequests.insertIfNew(makeWake('edge', { created_at: at(-HOUR) }));
        await t.wakeRequests.insertIfNew(makeWake('new'));
        await t.wakeRequests.insertIfNew(
          makeWake('other', { id: 'w-o', ticket_id: 'SF-2' }),
        );
      });

      expect(await tx((t) => t.wakeRequests.countSince('SF-1', at(-HOUR)))).toBe(2);
      expect(await tx((t) => t.wakeRequests.countSince('SF-1', at(-3 * HOUR)))).toBe(3);
      expect(await tx((t) => t.wakeRequests.countSince('SF-9', at(-3 * HOUR)))).toBe(0);
    });

    it('countSince does not count coalesced duplicates and can filter by kind', async () => {
      await tx(async (t) => {
        await t.wakeRequests.insertIfNew(makeWake('a'));
        await t.wakeRequests.insertIfNew(makeWake('a'));
        await t.wakeRequests.insertIfNew(makeWake('a'));
        await t.wakeRequests.insertIfNew(makeWake('b', { kind: 'response_wake' }));
        await t.wakeRequests.insertIfNew(makeWake('c', { kind: 'continuation' }));
      });

      expect(await tx((t) => t.wakeRequests.countSince('SF-1', at(-HOUR)))).toBe(3);
      expect(
        await tx((t) => t.wakeRequests.countSince('SF-1', at(-HOUR), ['retry'])),
      ).toBe(1);

      expect(
        await tx((t) =>
          t.wakeRequests.countSince('SF-1', at(-HOUR), ['retry', 'continuation']),
        ),
      ).toBe(2);

      expect(await tx((t) => t.wakeRequests.countSince('SF-1', at(-HOUR), []))).toBe(0);
    });

    it('rolls back with the transaction', async () => {
      await expect(
        tx(async (t) => {
          await t.wakeRequests.insertIfNew(makeWake('k1'));
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');

      expect(await tx((t) => t.wakeRequests.listDue(at(HOUR)))).toEqual([]);
    });
  });
}
