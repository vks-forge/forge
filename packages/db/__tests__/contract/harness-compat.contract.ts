/**
 * Contract cases for the per-build harness compatibility tables.
 *
 * Why: the server stores the result of each build's compatibility check and the owner's
 *   decision on each built-in tool's schema, and builds every run's tool policy from them.
 *   A backend that lost a decision, returned a report that no longer matches what was
 *   saved, or mixed rows of two builds would approve a tool nobody approved or hide a
 *   failed check, so each backend must behave the same.
 *
 * Exports: describeHarnessCompatContract().
 * Depends on: vitest, @forge/core. IO only through the adapter under test.
 */

import type { HarnessToolSchema, HarnessVersion, StorageAdapter } from '@forge/core';
import { describe, expect, it } from 'vitest';

const HASH_A = `sha256:${'a'.repeat(64)}`;
const HASH_B = `sha256:${'b'.repeat(64)}`;

const schema = (
  tool: string,
  over: Partial<HarnessToolSchema> = {},
  version = '2.1.299',
): HarnessToolSchema => ({
  harness_kind: 'claude',
  version,
  tool,
  schema_hash: HASH_A,
  status: 'pending',
  ...over,
});

const report = {
  kind: 'claude' as const,
  version: '2.1.299',
  started_at: '2026-10-14T10:00:00.000Z',
  finished_at: '2026-10-14T10:00:05.000Z',
  passed: true,
  summary: 'All checks passed.',
  checks: [{ id: 'tool_schemas' as const, status: 'pass' as const, detail: '26 tools' }],
  tools: [{ tool: 'read', native: ['Read'], schema_hash: HASH_A }],
};

/** Registers the cases; `getDb` returns the adapter the surrounding suite created for this test. */
export function describeHarnessCompatContract(getDb: () => StorageAdapter): void {
  const tx: StorageAdapter['transaction'] = (fn) => getDb().transaction(fn);

  describe('harness versions', () => {
    it('returns null for a build never seen', async () => {
      expect(await tx((t) => t.harnessVersions.get('claude', '9.9.9'))).toBeNull();
    });

    it('reads back a row with its report, and one without', async () => {
      const done: HarnessVersion = {
        kind: 'claude',
        version: '2.1.299',
        compat: 'pass',
        report,
        checked_at: '2026-10-14T10:00:05.000Z',
      };

      const waiting: HarnessVersion = {
        kind: 'claude',
        version: '2.1.300',
        compat: 'pending',
      };

      await tx(async (t) => {
        await t.harnessVersions.upsert(done);
        await t.harnessVersions.upsert(waiting);
      });

      expect(await tx((t) => t.harnessVersions.get('claude', '2.1.299'))).toEqual(done);
      expect(await tx((t) => t.harnessVersions.get('claude', '2.1.300'))).toEqual(
        waiting,
      );
    });

    it('upsert replaces by build and clears an omitted report', async () => {
      await tx(async (t) => {
        await t.harnessVersions.upsert({
          kind: 'claude',
          version: '1.0.0',
          compat: 'fail',
          report,
        });

        await t.harnessVersions.upsert({
          kind: 'claude',
          version: '1.0.0',
          compat: 'pending',
        });
      });

      const row = await tx((t) => t.harnessVersions.get('claude', '1.0.0'));

      expect(row).toEqual({ kind: 'claude', version: '1.0.0', compat: 'pending' });
    });

    it('rejects an unknown compat status and stores nothing', async () => {
      const failure = await tx((t) =>
        t.harnessVersions.upsert({
          kind: 'claude',
          version: '1.0.0',
          compat: 'maybe' as never,
        }),
      ).catch((e: unknown) => e);

      expect(failure).toBeInstanceOf(Error);
      expect(await tx((t) => t.harnessVersions.get('claude', '1.0.0'))).toBeNull();
    });
  });

  describe('harness tool schemas', () => {
    it('lists only the rows of one build, in first-insert order', async () => {
      await tx(async (t) => {
        await t.harnessToolSchemas.upsert(schema('read'));
        await t.harnessToolSchemas.upsert(schema('read', {}, '2.1.300'));
        await t.harnessToolSchemas.upsert(schema('grep'));
        await t.harnessToolSchemas.upsert(schema('read', { status: 'approved' }));
      });

      const list = await tx((t) => t.harnessToolSchemas.list('claude', '2.1.299'));

      expect(list.map((r) => [r.tool, r.status])).toEqual([
        ['read', 'approved'],
        ['grep', 'pending'],
      ]);

      expect(await tx((t) => t.harnessToolSchemas.list('claude', '0.0.0'))).toEqual([]);
    });

    it('stores the decision with who made it and when, and reads one row by key', async () => {
      const row = schema('edit', {
        schema_hash: HASH_B,
        status: 'denied',
        decided_by: 'owner',
        decided_at: '2026-10-14T11:00:00.000Z',
        decision_reason: 'Edit now takes a new argument we do not want',
      });

      await tx((t) => t.harnessToolSchemas.upsert(row));

      expect(
        await tx((t) => t.harnessToolSchemas.get('claude', '2.1.299', 'edit')),
      ).toEqual(row);

      expect(
        await tx((t) => t.harnessToolSchemas.get('claude', '2.1.299', 'nope')),
      ).toBeNull();
    });

    it('upsert replaces the decision and clears who decided when the new row has none', async () => {
      await tx(async (t) => {
        await t.harnessToolSchemas.upsert(
          schema('write', {
            status: 'approved',
            decided_by: 'owner',
            decided_at: '2026-10-14T11:00:00.000Z',
          }),
        );

        await t.harnessToolSchemas.upsert(schema('write', { schema_hash: HASH_B }));
      });

      const row = await tx((t) => t.harnessToolSchemas.get('claude', '2.1.299', 'write'));

      expect(row).toEqual(schema('write', { schema_hash: HASH_B }));
    });

    it('rejects an unknown status or a malformed hash and stores nothing', async () => {
      const bad = await tx((t) =>
        t.harnessToolSchemas.upsert(schema('read', { status: 'yes' as never })),
      ).catch((e: unknown) => e);

      const worse = await tx((t) =>
        t.harnessToolSchemas.upsert(schema('read', { schema_hash: 'abc' })),
      ).catch((e: unknown) => e);

      expect(bad).toBeInstanceOf(Error);
      expect(worse).toBeInstanceOf(Error);
      expect(await tx((t) => t.harnessToolSchemas.list('claude', '2.1.299'))).toEqual([]);
    });

    it('rolls back with the transaction', async () => {
      await expect(
        tx(async (t) => {
          await t.harnessToolSchemas.upsert(schema('read'));
          await t.harnessVersions.upsert({
            kind: 'claude',
            version: '2.1.299',
            compat: 'pass',
          });

          throw new Error('boom');
        }),
      ).rejects.toThrow();

      expect(await tx((t) => t.harnessToolSchemas.list('claude', '2.1.299'))).toEqual([]);
      expect(await tx((t) => t.harnessVersions.get('claude', '2.1.299'))).toBeNull();
    });
  });
}
