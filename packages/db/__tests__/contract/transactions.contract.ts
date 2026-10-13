/**
 * Contract cases for transaction semantics.
 *
 * Why: the Director moves a ticket and writes its run row in one transaction; if a throw
 * left half of that behind, a ticket could be in `running` with no run. Concurrent
 * transactions must serialize, and a callback that re-enters the adapter must fail fast
 * rather than deadlock the whole tick (director-core.md §3).
 *
 * Exports: describeTransactionsContract().
 * Depends on: vitest, @forge/core, helpers/fixtures. IO only through the adapter under test.
 */

import { describe, expect, it } from 'vitest';
import { InvalidInputError } from '@forge/core';
import type { StorageAdapter } from '@forge/core';
import {
  makeIntake,
  makeRun,
  makeTextEvent,
  makeTicket,
} from '#tests/helpers/fixtures.js';

/** Registers the cases; `getDb` returns the adapter the surrounding suite created for this test. */
export function describeTransactionsContract(getDb: () => StorageAdapter): void {
  const db: Pick<StorageAdapter, 'transaction'> = {
    transaction: (fn) => getDb().transaction(fn),
  };

  describe('transactions', () => {
    it('commits on success and returns the callback value', async () => {
      const v = await db.transaction(async (tx) => {
        await tx.tickets.insert(makeTicket(1));

        return 42;
      });

      const got = await db.transaction((tx) => tx.tickets.get(makeTicket(1).id));
      expect(v).toBe(42);
      expect(got).not.toBeNull();
    });

    it('rolls back every write and rethrows when the callback throws', async () => {
      const boom = new Error('boom');
      await expect(
        db.transaction(async (tx) => {
          await tx.tickets.insert(makeTicket(1));
          await tx.runs.insert(makeRun('r1'));
          await tx.runEvents.append('r1', makeTextEvent());
          await tx.intakeEvents.insertIfNew(makeIntake('k'));
          throw boom;
        }),
      ).rejects.toBe(boom);

      const after = await db.transaction(async (tx) => ({
        ticket: await tx.tickets.get(makeTicket(1).id),
        run: await tx.runs.get('r1'),
        events: await tx.runEvents.listByRun('r1'),
        intake: (await tx.intakeEvents.insertIfNew(makeIntake('k'))).inserted,
      }));

      expect(after).toEqual({ ticket: null, run: null, events: [], intake: true });
    });

    it('fails fast, not deadlocks, when the callback re-enters transaction()', async () => {
      const outcome = await Promise.race([
        db
          .transaction(async (tx) => {
            await tx.tickets.insert(makeTicket(1));
            await Promise.resolve();
            await db.transaction((inner) => inner.tickets.insert(makeTicket(2)));
          })
          .catch((e: unknown) => e),
        new Promise((r) => setTimeout(() => r('deadlock'), 1000)),
      ]);

      expect(outcome).toBeInstanceOf(InvalidInputError);
      expect(String((outcome as Error).message)).toMatch(/re-entr|nested/i);
      // the outer transaction rolled back and the adapter is still usable
      const after = await db.transaction(async (tx) => ({
        one: await tx.tickets.get(makeTicket(1).id),
        two: await tx.tickets.get(makeTicket(2).id),
      }));

      expect(after).toEqual({ one: null, two: null });
    });

    it('serializes concurrent transactions (single writer)', async () => {
      const order: string[] = [];
      const slow = db.transaction(async (tx) => {
        order.push('a:start');
        await tx.tickets.insert(makeTicket(1));
        await new Promise((r) => setTimeout(r, 20));
        order.push('a:end');
      });

      const fast = db.transaction(async (tx) => {
        order.push('b:start');
        await tx.tickets.insert(makeTicket(2));
        order.push('b:end');
      });

      await Promise.all([slow, fast]);
      expect(order).toEqual(['a:start', 'a:end', 'b:start', 'b:end']);
    });
  });
}
