/**
 * Contract cases for the intake event store: dedupe, stored ids and ticket mapping.
 *
 * Why: chat messages and webhooks are redelivered, so the store must drop duplicates, and
 * the engine must still learn which stored event a redelivery refers to, so that it can
 * find the ticket that event already became instead of creating a second one. The stored
 * id is also what `tickets.created_by_intake` points at, and `markTicket` is how the link
 * is written. A first mapping must stand: a late duplicate may not re-point an event at a
 * different ticket (director-core.md §7).
 *
 * `get` is how the engine reads the requester's hint, type and title back after a restart.
 *
 * Exports: describeIntakeEventsContract().
 * Depends on: vitest, helpers/fixtures. IO only through the adapter under test.
 */

import { describe, expect, it } from 'vitest';
import type { StorageAdapter } from '@forge/core';
import { makeIntake, makeTicket } from '#tests/helpers/fixtures.js';

/** Registers the cases; `getDb` returns the adapter the surrounding suite created for this test. */
export function describeIntakeEventsContract(getDb: () => StorageAdapter): void {
  const tx: StorageAdapter['transaction'] = (fn) => getDb().transaction(fn);

  describe('intake events', () => {
    it('stores a new event once and drops the duplicate, returning the stored copy both times', async () => {
      const first = await tx((t) => t.intakeEvents.insertIfNew(makeIntake('k1')));
      const again = await tx((t) =>
        t.intakeEvents.insertIfNew(
          makeIntake('k1', { payload: { text: 'redelivered' } }),
        ),
      );
      expect(first.inserted).toBe(true);
      expect(again.inserted).toBe(false);
      expect(again.event).toEqual(first.event);
      expect(again.event.payload).toEqual({ text: 'hello' });
    });

    it('returns the event as submitted plus a positive stored id', async () => {
      const { event } = await tx((t) => t.intakeEvents.insertIfNew(makeIntake('k1')));
      expect(event).toEqual({ ...makeIntake('k1'), id: event.id });
      expect(event.id).toBeGreaterThan(0);
    });

    it('numbers events in storage order', async () => {
      const [a, b, c] = await tx(async (t) => [
        (await t.intakeEvents.insertIfNew(makeIntake('a'))).event.id,
        (await t.intakeEvents.insertIfNew(makeIntake('b'))).event.id,
        (await t.intakeEvents.insertIfNew(makeIntake('a'))).event.id,
      ]);
      expect(b).toBeGreaterThan(a as number);
      expect(c).toBe(a);
    });

    it('scopes the dedupe key to its source', async () => {
      await tx((t) => t.intakeEvents.insertIfNew(makeIntake('k1')));
      const other = await tx((t) =>
        t.intakeEvents.insertIfNew(makeIntake('k1', { source: 'webhook' })),
      );
      expect(other.inserted).toBe(true);
    });

    it('markTicket links the event to a ticket; the first mapping stands', async () => {
      const { event } = await tx((t) => t.intakeEvents.insertIfNew(makeIntake('k1')));
      const mapped = await tx((t) =>
        t.intakeEvents.markTicket(event.id, makeTicket(1).id),
      );
      const remap = await tx((t) =>
        t.intakeEvents.markTicket(event.id, makeTicket(2).id),
      );
      const redelivered = await tx((t) => t.intakeEvents.insertIfNew(makeIntake('k1')));
      expect([mapped, remap]).toEqual([true, false]);
      expect(redelivered.event.ticket_id).toBe(makeTicket(1).id);
      expect(redelivered.inserted).toBe(false);
    });

    it('markTicket returns false for an unknown event', async () => {
      expect(await tx((t) => t.intakeEvents.markTicket(999, makeTicket(1).id))).toBe(
        false,
      );
    });

    it('get returns the stored event by id, including its ticket mapping, and null when unknown', async () => {
      const { event } = await tx((t) => t.intakeEvents.insertIfNew(makeIntake('k1')));
      expect(await tx((t) => t.intakeEvents.get(event.id))).toEqual(event);
      await tx((t) => t.intakeEvents.markTicket(event.id, makeTicket(1).id));
      expect(await tx((t) => t.intakeEvents.get(event.id))).toEqual({
        ...event,
        ticket_id: makeTicket(1).id,
      });
      expect(await tx((t) => t.intakeEvents.get(999))).toBeNull();
    });

    it('rolls back an insert with the transaction without consuming a stored event', async () => {
      await expect(
        tx(async (t) => {
          await t.intakeEvents.insertIfNew(makeIntake('k'));
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');
      const after = await tx((t) => t.intakeEvents.insertIfNew(makeIntake('k')));
      expect(after.inserted).toBe(true);
    });
  });
}
