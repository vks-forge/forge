/**
 * Contract cases for the ticket repository: insert, read, list and compare-and-swap.
 *
 * Why: two Director ticks (or a Director and the HTTP API) can race on one ticket. Only
 * the CAS keeps a stale writer from clobbering a newer status, and only boundary
 * validation keeps a malformed ticket from reaching a backend as a raw ZodError. These
 * cases pin both on every backend, plus the rule that the CAS alone owns
 * `status_version` and that optional columns can be cleared (director-core.md §3).
 *
 * Exports: describeTicketsContract().
 * Depends on: vitest, @forge/core, helpers/fixtures. IO only through the adapter under test.
 */

import { describe, expect, it } from 'vitest';
import { ForgeError, InvalidInputError, toTicketPatch, transition } from '@forge/core';
import type { StorageAdapter, TicketEvent } from '@forge/core';
import { makeTicket } from '#tests/helpers/fixtures.js';

/** Registers the cases; `getDb` returns the adapter the surrounding suite created for this test. */
export function describeTicketsContract(getDb: () => StorageAdapter): void {
  const db: Pick<StorageAdapter, 'transaction'> = {
    transaction: (fn) => getDb().transaction(fn),
  };

  describe('tickets', () => {
    it('inserts and reads back a ticket, null when absent', async () => {
      const t = makeTicket(1, { blocked_by: [makeTicket(2).id], tier_actual: 'B' });
      await db.transaction((tx) => tx.tickets.insert(t));
      const got = await db.transaction((tx) => tx.tickets.get(t.id));
      const missing = await db.transaction((tx) => tx.tickets.get(makeTicket(9).id));
      expect(got).toEqual(t);
      expect(missing).toBeNull();
    });

    it('stores conflict_count: starts at 0, is written by a CAS patch and read back', async () => {
      const t = makeTicket(1);
      await db.transaction((tx) => tx.tickets.insert(t));
      const start = await db.transaction((tx) => tx.tickets.get(t.id));
      await db.transaction((tx) =>
        tx.tickets.updateTicketCas(t.id, 0, { status: 'planned', conflict_count: 2 }),
      );

      const after = await db.transaction((tx) => tx.tickets.get(t.id));
      expect(start?.conflict_count).toBe(0);
      expect(after?.conflict_count).toBe(2);
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
      const failure = await db
        .transaction((tx) => tx.tickets.insert(makeTicket(1)))
        .catch((e: unknown) => e);

      expect(failure).toBeInstanceOf(InvalidInputError);
    });

    it('never leaks a raw ZodError: an invalid ticket is an InvalidInputError with the cause', async () => {
      const bad = makeTicket(1, { lane: 'nope' as never });
      const failure = await db
        .transaction((tx) => tx.tickets.insert(bad))
        .catch((e: unknown) => e);

      expect(failure).toBeInstanceOf(InvalidInputError);
      expect((failure as ForgeError).cause).toBeDefined();
      expect((failure as ForgeError).errorFamily).toBe('invalid_input');
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

    it('CAS refuses a caller-supplied status_version and leaves the row untouched', async () => {
      const t = makeTicket(1);
      await db.transaction((tx) => tx.tickets.insert(t));
      const patch = { status: 'planned', status_version: 5 } as never;
      const failure = await db
        .transaction((tx) => tx.tickets.updateTicketCas(t.id, 0, patch))
        .catch((e: unknown) => e);

      const got = await db.transaction((tx) => tx.tickets.get(t.id));
      expect(failure).toBeInstanceOf(InvalidInputError);
      expect(got).toMatchObject({ status: 'inbox', status_version: 0 });
    });

    it('CAS always sets status_version to expected + 1', async () => {
      const t = makeTicket(1, { status_version: 7 });
      await db.transaction((tx) => tx.tickets.insert(t));
      await db.transaction((tx) =>
        tx.tickets.updateTicketCas(t.id, 7, { rework_count: 2 }),
      );

      const got = await db.transaction((tx) => tx.tickets.get(t.id));
      expect(got?.status_version).toBe(8);
    });

    it('CAS clears an optional column when the patch carries it as undefined', async () => {
      const t = makeTicket(1, { blocked_reason: 'dep', tier_actual: 'B' });
      await db.transaction((tx) => tx.tickets.insert(t));
      await db.transaction((tx) =>
        tx.tickets.updateTicketCas(t.id, 0, {
          blocked_reason: undefined,
          tier_actual: undefined,
        }),
      );

      const got = await db.transaction((tx) => tx.tickets.get(t.id));
      expect(got).not.toBeNull();
      expect('blocked_reason' in (got ?? {})).toBe(false);
      expect('tier_actual' in (got ?? {})).toBe(false);
    });

    it('blocked then unblocked via transition() leaves no blocked_reason in the stored row', async () => {
      const start = makeTicket(1, { status: 'in_progress' });
      await db.transaction((tx) => tx.tickets.insert(start));
      const at = '2026-10-13T01:00:00.000Z';
      let cur = start;
      for (const e of [
        { type: 'blocked', at, reason: 'waiting on dep' },
        { type: 'unblocked', at },
      ] as TicketEvent[]) {
        const r = transition(cur, e);
        if (!r.ok) {
          throw new Error('unexpected transition error');
        }

        const next = r.value;
        const ok = await db.transaction((tx) =>
          tx.tickets.updateTicketCas(cur.id, cur.status_version, toTicketPatch(next)),
        );

        expect(ok).toBe(true);
        cur = next;
        const stored = await db.transaction((tx) => tx.tickets.get(cur.id));
        expect(stored).toEqual(cur);
        expect('blocked_reason' in (stored ?? {})).toBe(e.type === 'blocked');
      }
    });

    it('a stale tier_actual is cleared when the gate fails (no merge on an old pass)', async () => {
      const at = '2026-10-13T01:00:00.000Z';
      let cur = makeTicket(1, { status: 'in_progress' });
      await db.transaction((tx) => tx.tickets.insert(cur));
      for (const e of [
        { type: 'verifying', at },
        { type: 'gate_passed', at, tier_actual: 'A' },
        { type: 'gate_failed', at },
      ] as TicketEvent[]) {
        const r = transition(cur, e);
        if (!r.ok) {
          throw new Error('unexpected transition error');
        }

        const next = r.value;
        await db.transaction((tx) =>
          tx.tickets.updateTicketCas(cur.id, cur.status_version, toTicketPatch(next)),
        );

        cur = next;
      }

      const stored = await db.transaction((tx) => tx.tickets.get(cur.id));
      expect(stored?.status).toBe('in_progress');
      expect('tier_actual' in (stored ?? {})).toBe(false);
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
}
