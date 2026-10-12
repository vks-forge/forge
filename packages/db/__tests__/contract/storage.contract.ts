/**
 * StorageAdapter contract: one suite every storage backend must pass.
 *
 * Why: the Director must behave identically on any backend, so this suite is the
 *   executable definition of StorageAdapter and every backend must pass it. It pins the
 *   properties engine correctness rests on: a stale writer must lose the CAS race (or
 *   two Director ticks could double-dispatch a ticket), a throw rolls back every write
 *   in the transaction (or a ticket could move without its run row), concurrent
 *   transactions serialize, intake duplicates are dropped per source, run events read
 *   back in seq order and refuse a repeated seq, and only pending interactions are
 *   listed (director-core.md §3, §7, §8).
 *
 * Exports: describeStorageContract().
 * Depends on: vitest, @forge/core, helpers/fixtures. IO only through the adapter under test.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { StorageAdapter } from '@forge/core';
import {
  makeInteraction,
  makeIntake,
  makeRun,
  makeTextEvent,
  makeTicket,
} from '#tests/helpers/fixtures.js';

/** Register the shared contract; `makeAdapter` must return a fresh, empty adapter each call. */
export function describeStorageContract(
  name: string,
  makeAdapter: () => Promise<StorageAdapter> | StorageAdapter,
): void {
  describe(`StorageAdapter contract: ${name}`, () => {
    let db: StorageAdapter;
    beforeEach(async () => {
      db = await makeAdapter();
    });
    afterEach(async () => {
      await db.close();
    });

    describe('tickets', () => {
      it('inserts and reads back a ticket, null when absent', async () => {
        const t = makeTicket(1, { blocked_by: [makeTicket(2).id], tier_actual: 'B' });
        await db.transaction((tx) => tx.tickets.insert(t));
        const got = await db.transaction((tx) => tx.tickets.get(t.id));
        const missing = await db.transaction((tx) => tx.tickets.get(makeTicket(9).id));
        expect(got).toEqual(t);
        expect(missing).toBeNull();
      });

      it('lists tickets by status in insertion order', async () => {
        await db.transaction(async (tx) => {
          await tx.tickets.insert(makeTicket(1));
          await tx.tickets.insert(makeTicket(2, { status: 'planned' }));
          await tx.tickets.insert(makeTicket(3));
        });
        const inbox = await db.transaction((tx) => tx.tickets.listByStatus('inbox'));
        expect(inbox.map((t) => t.id)).toEqual([makeTicket(1).id, makeTicket(3).id]);
      });

      it('rejects a duplicate id', async () => {
        await db.transaction((tx) => tx.tickets.insert(makeTicket(1)));
        await expect(
          db.transaction((tx) => tx.tickets.insert(makeTicket(1))),
        ).rejects.toThrow();
      });

      it('CAS succeeds on the current version, applies the patch and bumps the version', async () => {
        const t = makeTicket(1);
        await db.transaction((tx) => tx.tickets.insert(t));
        const ok = await db.transaction((tx) =>
          tx.tickets.updateTicketCas(t.id, 0, { status: 'planned', rework_count: 1 }),
        );
        const got = await db.transaction((tx) => tx.tickets.get(t.id));
        expect(ok).toBe(true);
        expect(got).toMatchObject({
          status: 'planned',
          rework_count: 1,
          status_version: 1,
        });
      });

      it('CAS honours an explicit status_version in the patch', async () => {
        const t = makeTicket(1);
        await db.transaction((tx) => tx.tickets.insert(t));
        await db.transaction((tx) =>
          tx.tickets.updateTicketCas(t.id, 0, { status: 'planned', status_version: 5 }),
        );
        const got = await db.transaction((tx) => tx.tickets.get(t.id));
        expect(got?.status_version).toBe(5);
      });

      it('CAS fails on a stale version and leaves the row untouched', async () => {
        const t = makeTicket(1);
        await db.transaction((tx) => tx.tickets.insert(t));
        await db.transaction((tx) =>
          tx.tickets.updateTicketCas(t.id, 0, { status: 'planned' }),
        );
        const stale = await db.transaction((tx) =>
          tx.tickets.updateTicketCas(t.id, 0, { status: 'cancelled' }),
        );
        const got = await db.transaction((tx) => tx.tickets.get(t.id));
        expect(stale).toBe(false);
        expect(got?.status).toBe('planned');
      });

      it('CAS returns false for an unknown ticket', async () => {
        const ok = await db.transaction((tx) =>
          tx.tickets.updateTicketCas(makeTicket(7).id, 0, { status: 'planned' }),
        );
        expect(ok).toBe(false);
      });
    });

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
            await tx.runEvents.append('r1', makeTextEvent(0));
            await tx.intakeEvents.insertIfNew(makeIntake('k'));
            throw boom;
          }),
        ).rejects.toBe(boom);
        const after = await db.transaction(async (tx) => ({
          ticket: await tx.tickets.get(makeTicket(1).id),
          run: await tx.runs.get('r1'),
          events: await tx.runEvents.listByRun('r1'),
          intake: await tx.intakeEvents.insertIfNew(makeIntake('k')),
        }));
        expect(after).toEqual({ ticket: null, run: null, events: [], intake: true });
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

    describe('intake events', () => {
      it('stores a new event once and drops the duplicate', async () => {
        const first = await db.transaction((tx) =>
          tx.intakeEvents.insertIfNew(makeIntake('k1')),
        );
        const again = await db.transaction((tx) =>
          tx.intakeEvents.insertIfNew(makeIntake('k1')),
        );
        expect(first).toBe(true);
        expect(again).toBe(false);
      });

      it('scopes the dedupe key to its source', async () => {
        await db.transaction((tx) => tx.intakeEvents.insertIfNew(makeIntake('k1')));
        const other = await db.transaction((tx) =>
          tx.intakeEvents.insertIfNew(makeIntake('k1', { source: 'webhook' })),
        );
        expect(other).toBe(true);
      });
    });

    describe('runs', () => {
      it('round-trips a run, lists by ticket and applies updates', async () => {
        await db.transaction(async (tx) => {
          await tx.runs.insert(makeRun('r1'));
          await tx.runs.insert(makeRun('r2', { ticket_id: 'SF-2' }));
          await tx.runs.update('r1', {
            status: 'success',
            ended_at: '2026-10-13T01:00:00.000Z',
            cost_usd: 0.5,
            usage: { in: 1, out: 2, cachedIn: 3, cacheWrite: 4 },
          });
        });
        const { r1, list } = await db.transaction(async (tx) => ({
          r1: await tx.runs.get('r1'),
          list: await tx.runs.listByTicket('SF-1'),
        }));
        expect(r1).toMatchObject({
          status: 'success',
          cost_usd: 0.5,
          usage: { in: 1, out: 2, cachedIn: 3, cacheWrite: 4 },
        });
        expect(list.map((r) => r.id)).toEqual(['r1']);
      });
    });

    describe('run events', () => {
      it('lists in seq order regardless of append order', async () => {
        await db.transaction(async (tx) => {
          await tx.runEvents.append('r1', makeTextEvent(2));
          await tx.runEvents.append('r1', makeTextEvent(0));
          await tx.runEvents.append('r1', makeTextEvent(1));
          await tx.runEvents.append('r2', makeTextEvent(0, 'other'));
        });
        const all = await db.transaction((tx) => tx.runEvents.listByRun('r1'));
        expect(all.map((e) => e.seq)).toEqual([0, 1, 2]);
      });

      it('returns only events after afterSeq', async () => {
        await db.transaction(async (tx) => {
          for (const s of [0, 1, 2, 3]) await tx.runEvents.append('r1', makeTextEvent(s));
        });
        const tail = await db.transaction((tx) => tx.runEvents.listByRun('r1', 1));
        expect(tail.map((e) => e.seq)).toEqual([2, 3]);
      });

      it('is append-only: a repeated seq is rejected', async () => {
        await db.transaction((tx) => tx.runEvents.append('r1', makeTextEvent(0)));
        await expect(
          db.transaction((tx) => tx.runEvents.append('r1', makeTextEvent(0, 'dup'))),
        ).rejects.toThrow();
      });

      it('preserves structured payloads', async () => {
        const ev = {
          type: 'tool_call' as const,
          seq: 0,
          ts: '2026-10-13T00:00:00.000Z',
          call_id: 'c1',
          name: 'bash',
          input: { cmd: 'ls', nested: [1, { a: null }] },
        };
        await db.transaction((tx) => tx.runEvents.append('r1', ev));
        const [got] = await db.transaction((tx) => tx.runEvents.listByRun('r1'));
        expect(got).toEqual(ev);
      });
    });

    describe('interactions', () => {
      it('lists only pending interactions, oldest first, and drops answered ones', async () => {
        await db.transaction(async (tx) => {
          await tx.interactions.insert(
            makeInteraction('i2', { asked_at: '2026-10-13T02:00:00.000Z' }),
          );
          await tx.interactions.insert(makeInteraction('i1'));
          await tx.interactions.insert(makeInteraction('i3', { status: 'cancelled' }));
        });
        const pending = await db.transaction((tx) => tx.interactions.listPending());
        expect(pending.map((i) => i.id)).toEqual(['i1', 'i2']);

        await db.transaction((tx) =>
          tx.interactions.update('i1', {
            status: 'answered',
            answer: { choice: 'sqlite' },
            answered_at: '2026-10-13T03:00:00.000Z',
          }),
        );
        const after = await db.transaction((tx) => tx.interactions.listPending());
        const i1 = await db.transaction((tx) => tx.interactions.get('i1'));
        expect(after.map((i) => i.id)).toEqual(['i2']);
        expect(i1).toMatchObject({ status: 'answered', answer: { choice: 'sqlite' } });
      });

      it('returns null for an unknown interaction', async () => {
        const got = await db.transaction((tx) => tx.interactions.get('nope'));
        expect(got).toBeNull();
      });
    });
  });
}
