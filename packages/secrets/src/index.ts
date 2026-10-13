/**
 * Public API of @forge/secrets.
 *
 * Why: the app composes the server and the CLI with one SecretStore; this barrel is the
 *   only door into the package so the OS-specific adapter stays swappable.
 *
 * Exports: createDpapiSecretStore, DpapiSecretStoreOptions, createMemorySecretStore.
 * Depends on: adapters/dpapi, adapters/memory, types/dpapi. Re-exports only.
 */

export { createDpapiSecretStore } from '#/adapters/dpapi/dpapi-secret-store.js';
export type { DpapiSecretStoreOptions } from '#/types/dpapi.types.js';
export { createMemorySecretStore } from '#/adapters/memory/memory-secret-store.js';
