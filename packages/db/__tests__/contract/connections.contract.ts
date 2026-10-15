/**
 * Contract cases for the GitHub connections registry.
 *
 * Why: projects reach their repositories through a connection (one GitHub App per org or
 *   account, d-0094) and the GitHub host resolves the App id and key name from the stored
 *   row. A backend that lost the key's secret name, reordered rows or rewrote the creation
 *   time on update would point a project at the wrong App or hide when it was connected.
 *
 * Exports: describeConnectionsContract().
 * Depends on: vitest, @forge/core, helpers/fixtures. IO only through the adapter under test.
 */

import { describe, expect, it } from 'vitest';
import type { StorageAdapter } from '@forge/core';
import { makeConnection } from '#tests/helpers/fixtures.js';

export function describeConnectionsContract(getDb: () => StorageAdapter): void {
  const db: Pick<StorageAdapter, 'transaction'> = {
    transaction: (fn) => getDb().transaction(fn),
  };

  describe('github connections', () => {
    it('reads back an upserted connection and returns null for an unknown one', async () => {
      const c = makeConnection('acme', { app_slug: 'forge-acme' });
      await db.transaction((t) => t.githubConnections.upsert(c));
      expect(await db.transaction((t) => t.githubConnections.get('acme'))).toEqual(c);
      expect(await db.transaction((t) => t.githubConnections.get('nope'))).toBeNull();
    });

    it('lists oldest first and an update keeps position and creation time', async () => {
      await db.transaction(async (t) => {
        await t.githubConnections.upsert(makeConnection('a'));
        await t.githubConnections.upsert(makeConnection('b'));
        await t.githubConnections.upsert(
          makeConnection('a', {
            status: 'disabled',
            created_at: '2027-01-01T00:00:00.000Z',
          }),
        );
      });

      const list = await db.transaction((t) => t.githubConnections.list());

      expect(list.map((c) => c.id)).toEqual(['a', 'b']);
      expect(list[0]).toMatchObject({
        status: 'disabled',
        created_at: makeConnection('a').created_at,
      });
    });

    it('inserts a new id once and refuses to overwrite an existing one', async () => {
      const first = makeConnection('acme', { account: 'First' });
      const second = makeConnection('acme', { account: 'Second' });

      expect(await db.transaction((t) => t.githubConnections.insertIfAbsent(first))).toBe(
        true,
      );

      expect(
        await db.transaction((t) => t.githubConnections.insertIfAbsent(second)),
      ).toBe(false);

      expect(
        (await db.transaction((t) => t.githubConnections.get('acme')))?.account,
      ).toBe('First');
    });

    it('deletes a row and reports whether there was one', async () => {
      await db.transaction((t) => t.githubConnections.upsert(makeConnection('gone')));

      expect(await db.transaction((t) => t.githubConnections.delete('gone'))).toBe(true);
      expect(await db.transaction((t) => t.githubConnections.delete('gone'))).toBe(false);
      expect(await db.transaction((t) => t.githubConnections.get('gone'))).toBeNull();
    });

    it('rejects a row that is not a valid connection', async () => {
      await expect(
        db.transaction((t) => t.githubConnections.upsert(makeConnection('A b'))),
      ).rejects.toThrow();
    });

    it('rolls back with the transaction', async () => {
      await expect(
        db.transaction(async (t) => {
          await t.githubConnections.upsert(makeConnection('x'));
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');

      expect(await db.transaction((t) => t.githubConnections.list())).toEqual([]);
    });
  });
}
