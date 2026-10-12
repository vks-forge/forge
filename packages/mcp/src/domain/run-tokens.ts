/**
 * Per-run bearer token verification.
 *
 * Why: the Forge MCP server is a door into ticket and run state, started by the driver
 *   for exactly one run. The driver registers a token hash before launch and the server
 *   proves the caller's token against it on startup, so another process (or a Worker
 *   that learns the DB path) cannot speak as that run. Only hashes are stored, and the
 *   comparison is constant-time so the token cannot be guessed byte by byte.
 *
 * Exports: hashToken(), createRunTokenAuthority(), createMemoryTokenStore().
 * Depends on: node:crypto, types/deps.types, types/ports/run-token-store.types. No IO.
 */

import { createHash, timingSafeEqual } from 'node:crypto';
import type { RunTokenAuthority } from '#/types/deps.types.js';
import type { RunTokenStore } from '#/types/ports/run-token-store.types.js';

/** sha256 hex of a token; only this is ever stored. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function sameHash(a: string, b: string): boolean {
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

/** Verifies tokens against hashes held by `store`; unknown runs and store errors fail closed. */
export function createRunTokenAuthority(store: RunTokenStore): RunTokenAuthority {
  return {
    async verify(runId, token) {
      let stored: string | null = null;
      try {
        stored = await store.getTokenHash(runId);
      } catch {
        stored = null;
      }
      // Compare against a dummy when absent so timing does not reveal registration.
      return sameHash(stored ?? hashToken('\0'), hashToken(token)) && stored !== null;
    },
  };
}

/** In-process store for tests and embedded use. */
export function createMemoryTokenStore(): RunTokenStore & {
  register(runId: string, token: string): Promise<void>;
} {
  const hashes = new Map<string, string>();
  return {
    async register(runId, token) {
      hashes.set(runId, hashToken(token));
    },
    async getTokenHash(runId) {
      return hashes.get(runId) ?? null;
    },
  };
}
