/**
 * Contract every `SecretStore` must pass: `describeSecretStoreContract(name, make)`.
 *
 * Why: the server reads the GitHub App key and the CLI writes it through this port and
 *   must not care which adapter protects it. Every store must round-trip arbitrary bytes
 *   (a PEM key is text, but nothing may assume that), report a missing secret as null,
 *   replace on a second put, support namespaced names with sorted prefix `list` and
 *   idempotent `delete`, and refuse a name or prefix that could address a path, with the
 *   same typed error. A new adapter passes this before it gets tests of its own.
 *
 * Exports: describeSecretStoreContract().
 * Depends on: vitest, @forge/core (SecretStore, InvalidInputError).
 */

import { InvalidInputError } from '@forge/core';
import type { SecretStore } from '@forge/core';
import { beforeEach, describe, expect, it } from 'vitest';

export function describeSecretStoreContract(
  name: string,
  make: () => Promise<SecretStore>,
): void {
  // DPAPI spawns PowerShell per call, slow on a cold Windows box.
  describe(`SecretStore contract: ${name}`, { timeout: 60_000 }, () => {
    let store: SecretStore;
    beforeEach(async () => {
      store = await make();
    });

    it('returns null for a secret that was never stored', async () => {
      expect(await store.get('missing')).toBeNull();
    });

    it('round-trips arbitrary bytes, including zeros and high bytes', async () => {
      const bytes = Uint8Array.from([0, 1, 2, 255, 254, 0, 10, 13, 128]);

      await store.put('github-app-key', bytes);

      expect(await store.get('github-app-key')).toEqual(bytes);
    });

    it('round-trips a multi-line PEM-sized text', async () => {
      const pem = Buffer.from(
        `-----BEGIN KEY-----\n${'abcd'.repeat(900)}\n-----END KEY-----\n`,
      );

      await store.put('big', pem);

      expect(Buffer.from((await store.get('big')) as Uint8Array).equals(pem)).toBe(true);
    });

    it('replaces the value on a second put and keeps names independent', async () => {
      await store.put('a', Uint8Array.from([1]));
      await store.put('b', Uint8Array.from([2]));
      await store.put('a', Uint8Array.from([3]));

      expect(await store.get('a')).toEqual(Uint8Array.from([3]));
      expect(await store.get('b')).toEqual(Uint8Array.from([2]));
    });

    it('stores an empty secret', async () => {
      await store.put('empty', new Uint8Array(0));

      expect(await store.get('empty')).toEqual(new Uint8Array(0));
    });

    it('stores namespaced names independently of the flat name sharing a first segment', async () => {
      await store.put('github', Uint8Array.from([1]));
      await store.put('github/acme/key', Uint8Array.from([2]));
      await store.put('harness/claude/api-key', Uint8Array.from([3]));

      expect(await store.get('github')).toEqual(Uint8Array.from([1]));
      expect(await store.get('github/acme/key')).toEqual(Uint8Array.from([2]));
      expect(await store.get('github/acme')).toBeNull();
      expect(await store.get('harness/claude/api-key')).toEqual(Uint8Array.from([3]));
    });

    it('lists names by prefix, sorted, and everything for an empty prefix', async () => {
      for (const n of [
        'harness/b/api-key',
        'github/acme/key',
        'harness/a/oauth-token',
        'flat',
      ]) {
        await store.put(n, Uint8Array.from([1]));
      }

      expect(await store.list('')).toEqual([
        'flat',
        'github/acme/key',
        'harness/a/oauth-token',
        'harness/b/api-key',
      ]);

      expect(await store.list('harness/')).toEqual([
        'harness/a/oauth-token',
        'harness/b/api-key',
      ]);

      expect(await store.list('harness/a/')).toEqual(['harness/a/oauth-token']);
      expect(await store.list('har')).toEqual([
        'harness/a/oauth-token',
        'harness/b/api-key',
      ]);

      expect(await store.list('run/')).toEqual([]);
    });

    it('delete removes the secret, is idempotent, and leaves its neighbours', async () => {
      await store.put('harness/a/api-key', Uint8Array.from([1]));
      await store.put('harness/a/oauth-token', Uint8Array.from([2]));
      await store.put('harness/b/api-key', Uint8Array.from([3]));

      await store.delete('harness/a/api-key');
      await store.delete('harness/a/api-key');
      await store.delete('never/existed');

      expect(await store.get('harness/a/api-key')).toBeNull();
      expect(await store.get('harness/a/oauth-token')).toEqual(Uint8Array.from([2]));
      expect(await store.list('')).toEqual([
        'harness/a/oauth-token',
        'harness/b/api-key',
      ]);
    });

    it('a deleted name can be written again, also after its namespace emptied', async () => {
      await store.put('run/r1/secret', Uint8Array.from([1]));
      await store.delete('run/r1/secret');
      expect(await store.list('run/')).toEqual([]);

      await store.put('run/r1/secret', Uint8Array.from([9]));

      expect(await store.get('run/r1/secret')).toEqual(Uint8Array.from([9]));
    });

    it('rejects names that could address a path or break the grammar', async () => {
      const bad = [
        '',
        '../x',
        'a/../b',
        '/abs',
        'a//b',
        'a/',
        String.raw`a\b`,
        'A',
        'a/B',
        '-a',
        '.a',
        'C:x',
        'nul',
        'k.dpapi',
      ];

      for (const name of bad) {
        await expect(store.get(name), name).rejects.toBeInstanceOf(InvalidInputError);
        await expect(store.put(name, Uint8Array.from([1])), name).rejects.toBeInstanceOf(
          InvalidInputError,
        );

        await expect(store.delete(name), name).rejects.toBeInstanceOf(InvalidInputError);
      }
    });

    it('rejects prefixes that could address a path', async () => {
      for (const prefix of ['..', '../', '/', '/a', 'a//', 'A', String.raw`a\b`]) {
        await expect(store.list(prefix), prefix).rejects.toBeInstanceOf(
          InvalidInputError,
        );
      }
    });
  });
}
