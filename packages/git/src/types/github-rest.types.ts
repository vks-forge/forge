/**
 * Types for the GitHub REST client and the installation-token source.
 *
 * Why: the GitHub App host is built from two small collaborators, a REST client that turns
 *   statuses into typed errors and a token source that mints and caches installation
 *   tokens. Naming their shapes once lets the host and its tests depend on the contract,
 *   not on the implementations.
 *
 * Exports: RestResult, RestClient, TokenSource, TokenSourceOptions.
 * Depends on: none. Types only.
 */

export interface RestResult {
  readonly status: number;
  readonly json: unknown;
}

export interface RestClient {
  /**
   * Calls the API with a bearer credential. Statuses in `accept` return normally (a
   * missing body gives `json: null`); any other status throws a GitHostError.
   */
  call(
    credential: string,
    method: string,
    path: string,
    opts?: { body?: unknown; accept?: readonly number[] },
  ): Promise<RestResult>;
}

export interface TokenSource {
  /** A valid installation token, minted if the cached one is missing or near expiry. */
  token(): Promise<string>;
  /** Forgets `stale` if it is still the cached token, so the next `token()` mints a new one. */
  invalidate(stale: string): void;
}

export interface TokenSourceOptions {
  readonly rest: RestClient;
  readonly appId: string;
  readonly installationId: string;
  readonly privateKey: () => Promise<Uint8Array>;
  readonly now: () => number;
}
