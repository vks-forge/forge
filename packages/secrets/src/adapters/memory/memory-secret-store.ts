/**
 * In-memory SecretStore for tests.
 *
 * Why: the GitHost adapter, the engine and the CLI wrap command need a SecretStore in
 *   tests that must not touch DPAPI or the disk. It keeps defensive copies, so a caller
 *   that scrubs or mutates the bytes it passed in or got back cannot change what is
 *   stored, as with a real store. It validates names and prefixes exactly like the real
 *   store, so a test cannot pass with a name production would refuse.
 *
 * Exports: createMemorySecretStore().
 * Depends on: @forge/core (SecretStore, assertSecretName, assertSecretPrefix). No IO.
 */

import { assertSecretName, assertSecretPrefix } from '@forge/core';
import type { SecretStore } from '@forge/core';

export function createMemorySecretStore(): SecretStore {
  const secrets = new Map<string, Uint8Array>();

  return {
    async get(name) {
      assertSecretName(name);
      const found = secrets.get(name);

      return found === undefined ? null : new Uint8Array(found);
    },

    async put(name, bytes) {
      assertSecretName(name);
      secrets.set(name, new Uint8Array(bytes));
    },

    async delete(name) {
      assertSecretName(name);
      secrets.delete(name);
    },

    async list(prefix) {
      assertSecretPrefix(prefix);

      return [...secrets.keys()].filter((name) => name.startsWith(prefix)).sort();
    },
  };
}
