/**
 * Contract cases for the parked-harness table and ticket priority.
 *
 * Why: when a harness runs out of quota the engine parks it until the reset time, and every
 *   ticket that needs it waits. A backend that forgot a pause across a transaction, kept a
 *   stale reason after a second quota error, or lost a ticket's priority would start runs on
 *   an exhausted account or start work in the wrong order, so each backend must agree.
 *
 * Exports: describeHarnessStateContract().
 * Depends on: vitest, @forge/core, helpers/fixtures. IO only through the adapter under test.
 */

import { describe, expect, it } from 'vitest';
import type { HarnessState, StorageAdapter } from '@forge/core';
import { makeTicket } from '#tests/helpers/fixtures.js';

const state = (id: string, until: string, reason = 'no quota'): HarnessState => ({
  harness_id: id,
  paused_until: until,
  reason,
  updated_at: '2026-10-15T10:00:00.000Z',
});

/** Registers the cases; `getDb` returns the adapter the surrounding suite created for this test. */
export function describeHarnessStateContract(getDb: () => StorageAdapter): void {
  const tx: StorageAdapter['transaction'] = (fn) => getDb().transaction(fn);

  describe('harness_state', () => {
    it('is empty on a fresh database and null for an unknown harness', async () => {
      expect(await tx((t) => t.harnessState.list())).toEqual([]);
      expect(await tx((t) => t.harnessState.get('claude-code'))).toBeNull();
    });

    it('reads back what was upserted and replaces it on a second quota error', async () => {
      const first = state('claude-code', '2026-10-15T14:20:00.000Z', 'first');
      const second = state('claude-code', '2026-10-15T16:00:00.000Z', 'second');
      await tx((t) => t.harnessState.upsert(first));
      expect(await tx((t) => t.harnessState.get('claude-code'))).toEqual(first);

      await tx((t) => t.harnessState.upsert(second));
      expect(await tx((t) => t.harnessState.list())).toEqual([second]);
    });

    it('lists by harness id and clears one harness without touching the others', async () => {
      await tx(async (t) => {
        await t.harnessState.upsert(state('b', '2026-10-15T14:20:00.000Z'));
        await t.harnessState.upsert(state('a', '2026-10-15T15:20:00.000Z'));
      });

      expect((await tx((t) => t.harnessState.list())).map((s) => s.harness_id)).toEqual([
        'a',
        'b',
      ]);

      expect(await tx((t) => t.harnessState.clear('a'))).toBe(true);
      expect(await tx((t) => t.harnessState.clear('a'))).toBe(false);
      expect((await tx((t) => t.harnessState.list())).map((s) => s.harness_id)).toEqual([
        'b',
      ]);
    });

    it('rejects a malformed row and stores nothing', async () => {
      const failure = await tx((t) =>
        t.harnessState.upsert(state('claude-code', 'tomorrow')),
      ).catch((e: unknown) => e);

      expect(failure).toBeInstanceOf(Error);
      expect(await tx((t) => t.harnessState.list())).toEqual([]);
    });

    it('rolls back with the transaction', async () => {
      await expect(
        tx(async (t) => {
          await t.harnessState.upsert(state('a', '2026-10-15T14:20:00.000Z'));
          throw new Error('boom');
        }),
      ).rejects.toThrow();

      expect(await tx((t) => t.harnessState.list())).toEqual([]);
    });
  });

  describe('ticket priority', () => {
    it('defaults to 0, round-trips a raised priority and can be patched', async () => {
      const plain = makeTicket(1);
      const urgent = makeTicket(2, { priority: 5 });
      await tx(async (t) => {
        await t.tickets.insert(plain);
        await t.tickets.insert(urgent);
      });

      expect((await tx((t) => t.tickets.get(plain.id)))?.priority).toBe(0);
      expect((await tx((t) => t.tickets.get(urgent.id)))?.priority).toBe(5);

      expect(
        await tx((t) => t.tickets.updateTicketCas(plain.id, 0, { priority: -2 })),
      ).toBe(true);

      expect((await tx((t) => t.tickets.get(plain.id)))?.priority).toBe(-2);
    });
  });
}
