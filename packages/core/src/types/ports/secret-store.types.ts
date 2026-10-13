/**
 * SecretStore port — named secret bytes at rest.
 *
 * Why: the GitHub App private key must be usable by the server but never sit as plaintext
 *   in the repo or config. The server asks for a secret by name and each platform adapter
 *   decides how it is protected (Windows DPAPI, CurrentUser scope). Behind a port the
 *   GitHost adapter is tested with an in-memory store and the OS facility stays in one
 *   adapter package (d-0062).
 *
 * Exports: SecretStore.
 * Depends on: none. Types only.
 */

/**
 * Secrets by name. Names must match the `SecretName` schema; anything else throws
 * InvalidInputError, so a name can never address a path outside the store.
 */
export interface SecretStore {
  /** The secret's bytes, or null when no secret has that name. */
  get(name: string): Promise<Uint8Array | null>;
  /** Stores (or replaces) the secret. */
  put(name: string, bytes: Uint8Array): Promise<void>;
}
