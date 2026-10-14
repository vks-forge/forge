/**
 * SecretStore port — named secret bytes at rest.
 *
 * Why: the GitHub App private key, harness credentials and per-run secrets must be usable
 *   by the server but never sit as plaintext in the repo or config. The server asks for a
 *   secret by name and each platform adapter decides how it is protected (Windows DPAPI,
 *   CurrentUser scope). Behind a port the GitHost adapter is tested with an in-memory store
 *   and the OS facility stays in one adapter package. Names are namespaced paths
 *   (`github/<connection>/key`, `harness/<id>/api-key`, `run/<runId>/secret`) so the UI can
 *   list and remove everything of one kind, e.g. when a connection is deleted (d-0062,
 *   d-0087, d-0100).
 *
 * Exports: SecretStore.
 * Depends on: none. Types only.
 */

/**
 * Secrets by name. Names must match the `SecretName` schema and prefixes the
 * `SecretNamePrefix` schema; anything else throws InvalidInputError, so a name can never
 * address a path outside the store.
 */
export interface SecretStore {
  /** The secret's bytes, or null when no secret has that name. */
  get(name: string): Promise<Uint8Array | null>;
  /** Stores (or replaces) the secret. */
  put(name: string, bytes: Uint8Array): Promise<void>;
  /** Removes the secret. Idempotent: deleting a missing secret is not an error. */
  delete(name: string): Promise<void>;
  /** Names starting with `prefix` (`''` lists all), sorted ascending. */
  list(prefix: string): Promise<string[]>;
}
