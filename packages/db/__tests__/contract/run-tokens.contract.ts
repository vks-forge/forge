/**
 * Contract cases for run tokens.
 *
 * Why: a run token authenticates a Worker to the hook and MCP servers. Only a hash is
 * stored, so a leaked database file yields no usable credential, and a revoked token must
 * stay revoked: `issue` re-arming it would let a finished or killed run act again
 * (director-core.md §8).
 *
 * Exports: describeRunTokensContract().
 * Depends on: vitest, @forge/core, helpers/fixtures. IO only through the adapter under test.
 */

import { describe, expect, it } from 'vitest';
import { PolicyDeniedError } from '@forge/core';
import type { StorageAdapter } from '@forge/core';

/** Registers the cases; `getDb` returns the adapter the surrounding suite created for this test. */
export function describeRunTokensContract(getDb: () => StorageAdapter): void {
  const db: Pick<StorageAdapter, 'transaction'> = {
    transaction: (fn) => getDb().transaction(fn),
  };

  describe('run tokens', () => {
    const HASH = 'a'.repeat(64);
    const T1 = '2026-10-13T00:00:00.000Z';

    it('stores and returns the hash; null when absent', async () => {
      await db.transaction((tx) => tx.runTokens.put('r1', HASH, T1));
      const got = await db.transaction(async (tx) => ({
        r1: await tx.runTokens.getHash('r1'),
        r2: await tx.runTokens.getHash('r2'),
      }));

      expect(got).toEqual({ r1: HASH, r2: null });
    });

    it('returns null after revoke, leaves other runs alone, and tolerates unknown runs', async () => {
      await db.transaction(async (tx) => {
        await tx.runTokens.put('r1', HASH, T1);
        await tx.runTokens.put('r2', 'b'.repeat(64), T1);
      });

      await db.transaction(async (tx) => {
        await tx.runTokens.revoke('r1', T1);
        await tx.runTokens.revoke('ghost', T1);
      });

      const got = await db.transaction(async (tx) => ({
        r1: await tx.runTokens.getHash('r1'),
        r2: await tx.runTokens.getHash('r2'),
      }));

      expect(got).toEqual({ r1: null, r2: 'b'.repeat(64) });
    });

    it('reissue replaces the hash and clears the revocation (explicit re-arm)', async () => {
      await db.transaction(async (tx) => {
        await tx.runTokens.issue('r1', HASH, T1);
        await tx.runTokens.revoke('r1', T1);
        await tx.runTokens.reissue('r1', 'c'.repeat(64), T1);
      });

      const got = await db.transaction((tx) => tx.runTokens.getHash('r1'));
      expect(got).toBe('c'.repeat(64));
    });

    it.each(['issue', 'put'] as const)(
      '%s on a revoked run is refused and the token stays dead',
      async (method) => {
        await db.transaction(async (tx) => {
          await tx.runTokens.issue('r1', HASH, T1);
          await tx.runTokens.revoke('r1', T1);
        });

        const failure = await db
          .transaction((tx) => tx.runTokens[method]('r1', 'c'.repeat(64), T1))
          .catch((e: unknown) => e);

        const got = await db.transaction((tx) => tx.runTokens.getHash('r1'));
        expect(failure).toBeInstanceOf(PolicyDeniedError);
        expect(got).toBeNull();
      },
    );

    it('issue on a live token replaces it; reissue works for a never-issued run', async () => {
      await db.transaction(async (tx) => {
        await tx.runTokens.issue('r1', HASH, T1);
        await tx.runTokens.issue('r1', 'c'.repeat(64), T1);
        await tx.runTokens.reissue('r2', 'd'.repeat(64), T1);
      });

      const got = await db.transaction(async (tx) => ({
        r1: await tx.runTokens.getHash('r1'),
        r2: await tx.runTokens.getHash('r2'),
      }));

      expect(got).toEqual({ r1: 'c'.repeat(64), r2: 'd'.repeat(64) });
    });

    it('refuses anything that is not a sha256 hex digest (never store a raw token)', async () => {
      await expect(
        db.transaction((tx) => tx.runTokens.put('r1', 'raw-token-value', T1)),
      ).rejects.toThrow();

      const got = await db.transaction((tx) => tx.runTokens.getHash('r1'));
      expect(got).toBeNull();
    });

    it('rolls back with the transaction', async () => {
      await expect(
        db.transaction(async (tx) => {
          await tx.runTokens.put('r1', HASH, T1);
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');

      expect(await db.transaction((tx) => tx.runTokens.getHash('r1'))).toBeNull();
    });
  });
}
