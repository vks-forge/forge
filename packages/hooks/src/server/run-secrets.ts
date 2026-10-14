/**
 * In-memory registry of each run's bearer token and HMAC secret.
 *
 * Why: receipts are signed with a per-run secret that a Worker must never learn, and the
 *   hook route and gate G1 both need it. If it were on disk, a Worker able to read the
 *   database or run directory could forge a clean receipt chain, so it lives only in this
 *   process (d-0054). The consequence is the M0 restart rule: a restarted server cannot
 *   verify old chains, so it kills in-flight runs instead. The registry is capped so a
 *   long-lived server cannot grow without bound; the oldest runs fall out first, and a gate
 *   that then finds no secret cannot verify the chain and must not pass the run.
 *
 * Exports: MAX_RUN_SECRETS, createRunSecretRegistry().
 * Depends on: node:crypto, @forge/core (InvalidInputError), types/hook-handler,
 *   types/run-secrets. No IO beyond the OS random source.
 */

import { randomBytes } from 'node:crypto';
import { InvalidInputError } from '@forge/core';
import type { RunCredentials } from '#/types/hook-handler.types.js';
import type { RunSecretRegistry } from '#/types/run-secrets.types.js';

/** Enough for weeks of runs on one machine, small enough to stay negligible. */
export const MAX_RUN_SECRETS = 5_000;

/** Creates an empty registry; `newSecret` is injectable for tests. */
export function createRunSecretRegistry(
  newSecret: () => string = () => randomBytes(32).toString('hex'),
  max: number = MAX_RUN_SECRETS,
): RunSecretRegistry {
  const entries = new Map<string, RunCredentials>();

  return {
    register(runId, token) {
      if (entries.has(runId)) {
        throw new InvalidInputError(`run ${runId} already has credentials`);
      }

      const creds: RunCredentials = { token, secret: newSecret() };
      entries.set(runId, creds);

      for (const oldest of entries.keys()) {
        if (entries.size <= max) {
          break;
        }

        entries.delete(oldest);
      }

      return creds;
    },
    async credentials(runId) {
      return entries.get(runId) ?? null;
    },
    secret: (runId) => entries.get(runId)?.secret ?? null,
    size: () => entries.size,
  };
}
