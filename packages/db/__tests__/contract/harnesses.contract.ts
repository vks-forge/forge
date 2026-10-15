/**
 * Contract cases for the harness registry.
 *
 * Why: the server reads the harness row at the start of every run to learn which
 *   executable to start and how it authenticates. A backend that lost an edit, kept a
 *   cleared binary path, or accepted an auth mode no driver implements would start runs on
 *   the wrong binary or the wrong billing account, so each backend must behave the same.
 *
 * Exports: describeHarnessesContract().
 * Depends on: vitest, @forge/core, helpers/fixtures. IO only through the adapter under test.
 */

import { describe, expect, it } from 'vitest';
import type { StorageAdapter } from '@forge/core';
import { makeHarness } from '#tests/helpers/fixtures.js';

/** Registers the cases; `getDb` returns the adapter the surrounding suite created for this test. */
export function describeHarnessesContract(getDb: () => StorageAdapter): void {
  const tx: StorageAdapter['transaction'] = (fn) => getDb().transaction(fn);

  describe('harnesses', () => {
    it('is empty on a fresh database and returns null for an unknown id', async () => {
      expect(await tx((t) => t.harnesses.list())).toEqual([]);
      expect(await tx((t) => t.harnesses.get('claude'))).toBeNull();
    });

    it('reads back what was upserted, optional fields included', async () => {
      const h = makeHarness('claude', {
        binary_path: 'C:/Users/me/.local/bin/claude.exe',
        version: '2.1.299',
        auth_mode: 'api_key',
        status: 'ok',
        last_checked_at: '2026-10-14T10:00:00.000Z',
      });

      await tx((t) => t.harnesses.upsert(h));
      expect(await tx((t) => t.harnesses.get('claude'))).toEqual(h);
    });

    it('stores a paused status with its plain-language note and clears it on the next save', async () => {
      const paused = makeHarness('claude', {
        status: 'paused',
        status_note:
          'Claude Code 2.1.300 failed the compatibility check: hooks did not run.',
      });

      await tx((t) => t.harnesses.upsert(paused));
      expect(await tx((t) => t.harnesses.get('claude'))).toEqual(paused);

      await tx((t) => t.harnesses.upsert(makeHarness('claude', { status: 'ok' })));
      expect(await tx((t) => t.harnesses.get('claude'))).toEqual(
        makeHarness('claude', { status: 'ok' }),
      );
    });

    it('upsert replaces by id, clears omitted optionals and keeps list order', async () => {
      await tx(async (t) => {
        await t.harnesses.upsert(makeHarness('a', { binary_path: 'C:/a/claude.exe' }));
        await t.harnesses.upsert(makeHarness('b'));
        await t.harnesses.upsert(makeHarness('a', { auth_mode: 'oauth_token' }));
      });

      const list = await tx((t) => t.harnesses.list());
      expect(list.map((h) => h.id)).toEqual(['a', 'b']);
      expect(list[0]).toEqual(makeHarness('a', { auth_mode: 'oauth_token' }));
      expect('binary_path' in (list[0] ?? {})).toBe(false);
    });

    it('rejects an unknown auth mode and leaves nothing stored', async () => {
      const failure = await tx((t) =>
        t.harnesses.upsert(makeHarness('a', { auth_mode: 'password' as never })),
      ).catch((e: unknown) => e);

      expect(failure).toBeInstanceOf(Error);
      expect(await tx((t) => t.harnesses.list())).toEqual([]);
    });

    it('rolls back with the transaction', async () => {
      await expect(
        tx(async (t) => {
          await t.harnesses.upsert(makeHarness('a'));
          throw new Error('boom');
        }),
      ).rejects.toThrow();

      expect(await tx((t) => t.harnesses.list())).toEqual([]);
    });
  });
}
