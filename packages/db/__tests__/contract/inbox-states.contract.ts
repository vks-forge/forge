/**
 * Contract cases for `inboxStates` and the harness lists the inbox reads.
 *
 * Why: the owner's read and archive marks must survive a transaction, be replaced (not
 *   duplicated) on a second mark, clear when unmarked and never show in another project, or
 *   archiving in one project would hide items in another or a stale mark would linger. The
 *   inbox also lists failed harness builds and pending tool approvals, so both backends must
 *   return exactly the rows with that status.
 *
 * Exports: describeInboxStatesContract().
 * Depends on: vitest, @forge/core. IO only through the adapter under test.
 */

import { describe, expect, it } from 'vitest';
import type { InboxStateRow, StorageAdapter } from '@forge/core';

const T = '2026-10-13T00:00:00.000Z';
const row = (over: Partial<InboxStateRow> = {}): InboxStateRow => ({
  project: 'p1',
  kind: 'question',
  item_id: 'int-1',
  read_at: T,
  read_item_updated_at: T,
  ...over,
});

/** Registers the cases; `getDb` returns the adapter the surrounding suite created for this test. */
export function describeInboxStatesContract(getDb: () => StorageAdapter): void {
  const tx: StorageAdapter['transaction'] = (fn) => getDb().transaction(fn);

  describe('inboxStates', () => {
    it('returns null for an unmarked item and reads back what was written', async () => {
      expect(await tx((t) => t.inboxStates.get('p1', 'question', 'int-1'))).toBeNull();
      const archived = row({ archived_at: T, archived_item_updated_at: T });

      await tx((t) => t.inboxStates.upsert(archived));

      expect(await tx((t) => t.inboxStates.get('p1', 'question', 'int-1'))).toEqual(
        archived,
      );
    });

    it('replaces the row on a second upsert, clearing fields that are absent', async () => {
      await tx((t) => t.inboxStates.upsert(row()));
      await tx((t) =>
        t.inboxStates.upsert({ project: 'p1', kind: 'question', item_id: 'int-1' }),
      );

      const got = await tx((t) => t.inboxStates.listByProject('p1'));

      expect(got).toEqual([{ project: 'p1', kind: 'question', item_id: 'int-1' }]);
    });

    it('lists only the marks of the asked project', async () => {
      await tx(async (t) => {
        await t.inboxStates.upsert(row());
        await t.inboxStates.upsert(row({ project: 'p2' }));
      });

      const p2 = await tx((t) => t.inboxStates.listByProject('p2'));

      expect(p2.map((r) => r.project)).toEqual(['p2']);
      expect(await tx((t) => t.inboxStates.listByProject('p3'))).toEqual([]);
    });

    it('rolls a mark back with its transaction', async () => {
      await tx(async (t) => {
        await t.inboxStates.upsert(row());
        throw new Error('boom');
      }).catch(() => undefined);

      expect(await tx((t) => t.inboxStates.listByProject('p1'))).toEqual([]);
    });
  });

  describe('harness lists for the inbox', () => {
    it('lists builds by compat result and tool schemas by decision', async () => {
      const hash = `sha256:${'a'.repeat(64)}`;
      const tool = (name: string, status: 'pending' | 'approved') => ({
        harness_kind: 'claude' as const,
        version: '1',
        tool: name,
        schema_hash: hash,
        status,
      });

      await tx(async (t) => {
        await t.harnessVersions.upsert({ kind: 'claude', version: '1', compat: 'fail' });
        await t.harnessVersions.upsert({ kind: 'claude', version: '2', compat: 'pass' });
        await t.harnessToolSchemas.upsert(tool('read', 'pending'));
        await t.harnessToolSchemas.upsert(tool('bash', 'approved'));
      });

      const failed = await tx((t) => t.harnessVersions.listByCompat('fail'));
      const pendingBuilds = await tx((t) => t.harnessVersions.listByCompat('pending'));
      const pendingTools = await tx((t) => t.harnessToolSchemas.listByStatus('pending'));

      expect(failed.map((v) => v.version)).toEqual(['1']);
      expect(pendingBuilds).toEqual([]);
      expect(pendingTools.map((s) => s.tool)).toEqual(['read']);
    });
  });
}
