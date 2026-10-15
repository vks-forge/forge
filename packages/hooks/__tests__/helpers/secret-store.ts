/**
 * A SecretStore in memory for @forge/hooks tests.
 *
 * Why: the run secret registry keeps per-run secrets in a SecretStore (d-0100) and its tests
 *   must not touch DPAPI or the disk. This is the smallest store that still validates names
 *   and prefixes with the core rules, so a test cannot pass with a name production refuses.
 *   Adapter packages may not import each other, so this does not borrow `@forge/secrets`.
 *
 * Exports: createFakeSecretStore().
 * Depends on: @forge/core (SecretStore, assertSecretName, assertSecretPrefix). No IO.
 */

import { assertSecretName, assertSecretPrefix } from '@forge/core';
import type { SecretStore } from '@forge/core';

export function createFakeSecretStore(): SecretStore {
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

      return [...secrets.keys()].filter((n) => n.startsWith(prefix)).sort();
    },
  };
}
