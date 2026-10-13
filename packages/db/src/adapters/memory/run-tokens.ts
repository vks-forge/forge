/**
 * In-memory RunTokenRepository: bearer-token hashes only, revocable.
 *
 * Why: the MCP server and the hook both prove a caller holds the token issued for one run,
 *   and a revoked token must stay dead until someone deliberately re-arms it. This keeps the
 *   same rules as the SQLite table in memory: only SHA-256 digests are accepted, `issue`
 *   refuses a revoked run (a late or replayed issue cannot resurrect a token), and only
 *   `reissue` clears a revocation, so tests of the auth path see production behaviour
 *   (tool-system.md §10).
 *
 * Exports: memoryRunTokens().
 * Depends on: @forge/core, shared/run-token, types/memory-state.types. No IO.
 */

import { PolicyDeniedError } from '@forge/core';
import type { RunTokenRepository } from '@forge/core';
import { parseTokenRecord } from '#/shared/run-token.js';
import type { MemoryState } from '#/types/memory-state.types.js';

export function memoryRunTokens(state: MemoryState): RunTokenRepository {
  return {
    async issue(runId, tokenSha256) {
      const t = parseTokenRecord(runId, tokenSha256);
      if (state.tokens.get(t.runId)?.revoked === true) {
        throw new PolicyDeniedError(
          `run ${runId} token was revoked; use reissue to re-arm`,
        );
      }

      state.tokens.set(t.runId, { sha256: t.tokenSha256, revoked: false });
    },
    async reissue(runId, tokenSha256) {
      const t = parseTokenRecord(runId, tokenSha256);
      state.tokens.set(t.runId, { sha256: t.tokenSha256, revoked: false });
    },
    put(runId, tokenSha256, issuedAt) {
      return this.issue(runId, tokenSha256, issuedAt);
    },
    async getHash(runId) {
      const t = state.tokens.get(runId);

      return t && !t.revoked ? t.sha256 : null;
    },
    async revoke(runId) {
      const t = state.tokens.get(runId);
      if (t) {
        t.revoked = true;
      }
    },
  };
}
