/**
 * Contract cases for a ticket's pipeline snapshot.
 *
 * Why: a ticket runs on the copy of its lane pipeline it took at its first dispatch, so a later
 *   settings edit can never change a started ticket. Both storage backends must therefore keep the
 *   first snapshot (a second insert is refused, not overwritten), record routed stages without losing
 *   the roles or creation time, replace the copy only for a heavier lane, refuse to change a ticket
 *   that has none, and refuse a definition that breaks the schema without writing anything.
 *
 * Exports: describeTicketPipelinesContract().
 * Depends on: vitest, @forge/core, helpers/fixtures. IO only through the adapter under test.
 */

import { describe, expect, it } from 'vitest';
import { BUILTIN_PIPELINES } from '@forge/core';
import type { StorageAdapter, TicketId, TicketPipeline } from '@forge/core';
import { T0, makeTicket } from '#tests/helpers/fixtures.js';

const HASH = 'b'.repeat(64);
const T1 = '2026-10-13T01:00:00.000Z';
const roles = {
  implementer: 'writer',
  'test-writer': 'tester',
  reviewer: 'reviewer',
} as const;

const snapshot = (id: string, over: Partial<TicketPipeline> = {}): TicketPipeline => ({
  ticket_id: id as TicketId,
  lane: 'standard',
  definition: BUILTIN_PIPELINES.standard,
  roles,
  hash: HASH,
  config_version: 'c1:p0',
  routed: [],
  created_at: T0,
  updated_at: T0,
  ...over,
});

/** Registers the cases; `getDb` returns the adapter the surrounding suite created for this test. */
export function describeTicketPipelinesContract(getDb: () => StorageAdapter): void {
  const tx: StorageAdapter['transaction'] = (fn) => getDb().transaction(fn);
  const seedTicket = (n = 1) => tx((t) => t.tickets.insert(makeTicket(n)));
  const TID = makeTicket(1).id;

  describe('ticket pipelines', () => {
    it('stores the first snapshot of a ticket and keeps it: a second insert is refused', async () => {
      await seedTicket();

      const first = await tx((t) => t.ticketPipelines.insert(snapshot(TID)));
      const second = await tx((t) =>
        t.ticketPipelines.insert(snapshot(TID, { lane: 'full', hash: 'c'.repeat(64) })),
      );

      expect(first).toBe(true);
      expect(second).toBe(false);
      expect(await tx((t) => t.ticketPipelines.get(TID))).toEqual(snapshot(TID));
    });

    it('reads null for a ticket with no snapshot', async () => {
      expect(await tx((t) => t.ticketPipelines.get('SF-99'))).toBeNull();
    });

    it('records routed stages with the new definition and hash, keeping roles and creation time', async () => {
      await seedTicket();
      await tx((t) => t.ticketPipelines.insert(snapshot(TID)));
      const stages = [...BUILTIN_PIPELINES.standard.stages];
      stages.splice(4, 0, {
        id: 'route-net',
        kind: 'agent',
        label: 'Net',
        agent: 'reviewer',
      });

      await tx((t) =>
        t.ticketPipelines.appendRouted(TID, {
          definition: { stages },
          hash: 'd'.repeat(64),
          routed: [
            { rule_id: 'net', agent: 'reviewer', stage_id: 'route-net', at: 'diff' },
          ],
          at: T1,
        }),
      );

      const got = await tx((t) => t.ticketPipelines.get(TID));
      expect(got).toMatchObject({
        hash: 'd'.repeat(64),
        roles,
        created_at: T0,
        updated_at: T1,
        routed: [{ rule_id: 'net', at: 'diff' }],
      });

      expect(got?.definition.stages.map((s) => s.id)).toContain('route-net');
    });

    it('replaces the snapshot of a heavier lane', async () => {
      await seedTicket();
      await tx((t) => t.ticketPipelines.insert(snapshot(TID)));

      await tx((t) =>
        t.ticketPipelines.replace(
          snapshot(TID, {
            lane: 'full',
            definition: BUILTIN_PIPELINES.full,
            hash: 'e'.repeat(64),
            updated_at: T1,
          }),
        ),
      );

      expect(await tx((t) => t.ticketPipelines.get(TID))).toMatchObject({
        lane: 'full',
        hash: 'e'.repeat(64),
        created_at: T0,
        updated_at: T1,
      });
    });

    it('refuses to change a ticket that has no snapshot', async () => {
      await expect(
        tx((t) =>
          t.ticketPipelines.appendRouted(TID, {
            definition: BUILTIN_PIPELINES.express,
            hash: HASH,
            routed: [],
            at: T1,
          }),
        ),
      ).rejects.toThrow();

      await expect(tx((t) => t.ticketPipelines.replace(snapshot(TID)))).rejects.toThrow();
    });

    it('refuses a snapshot whose definition breaks the schema, and writes nothing', async () => {
      await seedTicket();

      await expect(
        tx((t) =>
          t.ticketPipelines.insert(
            snapshot(TID, { definition: { stages: [] } as never }),
          ),
        ),
      ).rejects.toThrow();

      expect(await tx((t) => t.ticketPipelines.get(TID))).toBeNull();
    });
  });
}
