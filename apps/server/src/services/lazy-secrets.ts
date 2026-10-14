/**
 * A SecretStore that is created on first use.
 *
 * Why: a server can run many projects and most local-bare ones never need a secret, while
 *   the DPAPI store refuses to exist off Windows. Creating it eagerly would stop such a
 *   server at start. Creating it on the first read, write or listing means a machine with
 *   no GitHub project never touches it, and a machine that needs it and cannot have it
 *   fails at that call with the store's own "refusing to fall back to plaintext" error.
 *
 * Exports: createLazySecretStore().
 * Depends on: @forge/core (SecretStore). IO only through the store it creates.
 */

import type { SecretStore } from '@forge/core';

/** `create` runs once, at the first call to any method. */
export function createLazySecretStore(create: () => SecretStore): SecretStore {
  let store: SecretStore | null = null;
  const real = (): SecretStore => (store ??= create());

  return {
    get: (name) => real().get(name),
    put: (name, bytes) => real().put(name, bytes),
    delete: (name) => real().delete(name),
    list: (prefix) => real().list(prefix),
  };
}
