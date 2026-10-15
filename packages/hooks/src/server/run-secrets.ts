/**
 * Registry of each run's bearer token and HMAC secrets.
 *
 * Why: receipts are signed with a per-run secret that a Worker must never learn, and the hook
 *   route and gate G1 both need it. A run can outlive a server restart (d-0092), and G1 must
 *   still verify what was signed before it, so the secret of every generation is stored in
 *   the SecretStore (DPAPI-encrypted on Windows) as `run/<runId>/secret-g<generation>` for
 *   the life of the run and deleted when the run is retired (d-0100). The bearer token is the
 *   opposite: only its hash is in the database and the token itself stays in this process's
 *   memory, so a restart makes every old token unknown and the dead Worker's hook calls are
 *   refused; a resume registers a new generation with a new token and a new secret. Memory is
 *   capped so a long-lived server cannot grow without bound; an evicted run's secret is still
 *   read from the store, only its token is gone. A gate that finds no secret for a generation
 *   cannot verify the chain and must not pass the run.
 *
 * Exports: MAX_RUN_SECRETS, secretName(), createRunSecretRegistry().
 * Depends on: node:crypto, @forge/core (InvalidInputError, SecretStore), types/hook-handler,
 *   types/run-secrets. IO only through the injected SecretStore and the OS random source.
 */

import { randomBytes } from 'node:crypto';
import { InvalidInputError } from '@forge/core';
import type { HmacKey } from '@forge/tools';
import type { RunCredentials } from '#/types/hook-handler.types.js';
import type {
  RunSecretRegistry,
  RunSecretRegistryOptions,
} from '#/types/run-secrets.types.js';

/** Enough for weeks of runs on one machine, small enough to stay negligible. */
export const MAX_RUN_SECRETS = 5_000;

const SECRET_NAME = /^run\/([^/]+)\/secret-g(\d+)$/;

/** The SecretStore name of one generation's secret. */
export function secretName(runId: string, generation: number): string {
  return `run/${runId}/secret-g${generation}`;
}

/** Creates an empty registry. */
export function createRunSecretRegistry(
  opts: RunSecretRegistryOptions = {},
): RunSecretRegistry {
  const { store } = opts;
  const newSecret = opts.newSecret ?? ((): string => randomBytes(32).toString('hex'));
  const max = opts.max ?? MAX_RUN_SECRETS;
  // Credentials of the current generation, and every secret this process created or read.
  const current = new Map<string, RunCredentials>();
  const secrets = new Map<string, HmacKey>();

  const known = async (runId: string, generation: number): Promise<HmacKey | null> => {
    const name = secretName(runId, generation);
    const cached = secrets.get(name);
    if (cached !== undefined) {
      return cached;
    }

    const bytes = await store?.get(name);
    if (!bytes) {
      return null;
    }

    const secret = Buffer.from(bytes).toString('utf8');
    secrets.set(name, secret);

    return secret;
  };

  const forgetMemory = (runId: string): void => {
    current.delete(runId);
    for (const name of [...secrets.keys()]) {
      if (name.startsWith(`run/${runId}/`)) {
        secrets.delete(name);
      }
    }
  };

  async function retire(runId: string): Promise<void> {
    forgetMemory(runId);
    for (const name of (await store?.list(`run/${runId}/`)) ?? []) {
      await store?.delete(name);
    }
  }

  return {
    async register(runId, token, generation = 1) {
      if ((await known(runId, generation)) !== null) {
        throw new InvalidInputError(
          `run ${runId} already has a secret for generation ${generation}`,
        );
      }

      const secret = newSecret();
      // Stored first: a secret that exists only in memory would make the receipts signed
      // with it unverifiable after a restart.
      await store?.put(secretName(runId, generation), Buffer.from(secret, 'utf8'));
      secrets.set(secretName(runId, generation), secret);
      const creds: RunCredentials = { token, secret, generation };
      current.delete(runId);
      current.set(runId, creds);

      for (const oldest of current.keys()) {
        if (current.size <= max) {
          break;
        }

        forgetMemory(oldest);
      }

      return creds;
    },
    async credentials(runId) {
      return current.get(runId) ?? null;
    },
    secret: known,
    retire,
    async sweep(isOver) {
      const runs = new Set<string>();
      for (const name of (await store?.list('run/')) ?? []) {
        const run = SECRET_NAME.exec(name)?.[1];
        if (run) {
          runs.add(run);
        }
      }

      const swept: string[] = [];
      for (const runId of runs) {
        if (await isOver(runId)) {
          await retire(runId);
          swept.push(runId);
        }
      }

      return swept;
    },
    size: () => current.size,
  };
}
