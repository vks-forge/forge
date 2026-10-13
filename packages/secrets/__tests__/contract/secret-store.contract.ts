/**
 * Contract every `SecretStore` must pass: `describeSecretStoreContract(name, make)`.
 *
 * Why: the server reads the GitHub App key and the CLI writes it through this port and
 *   must not care which adapter protects it. Every store must round-trip arbitrary bytes
 *   (a PEM key is text, but nothing may assume that), report a missing secret as null,
 *   replace on a second put, and refuse a name that could address a path, with the same
 *   typed error. A new adapter passes this before it gets tests of its own.
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

    it('rejects names that could address a path or break the grammar', async () => {
      for (const bad of ['', '../x', 'a/b', 'a\\b', 'A', '-a', 'a.b', 'C:x']) {
        await expect(store.get(bad), bad).rejects.toBeInstanceOf(InvalidInputError);
        await expect(store.put(bad, Uint8Array.from([1])), bad).rejects.toBeInstanceOf(
          InvalidInputError,
        );
      }
    });
  });
}
