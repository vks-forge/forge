/**
 * Prepares one run for the Worker driver: run directory, credentials, MCP entry, hook URL.
 *
 * Why: the driver starts a harness but owns neither the run's token nor its place on disk.
 *   This is the app's half of starting a run (d-0033, d-0100). The engine already issued the
 *   token and stored only its hash; here the same token is registered with a fresh HMAC
 *   secret for the run's generation (kept in the SecretStore for the life of the run), and a
 *   resume (generation 2 or more, after a restart, d-0092) first writes the `resumed` link
 *   into the receipt chain, signed with the new secret, so G1 can verify the chain segment by
 *   segment. A run directory is created under `<dataHome>/runs/<id>/` (outside
 *   the worktree, so the Worker cannot edit what the hook reads), and the per-run MCP
 *   server is described so the harness can launch `apps/mcp` with exactly this run's id,
 *   token and database path. The hook is told the server's base URL, which is only known
 *   once the port is bound, so it is read lazily. A resume runs this again, so the hook
 *   config the driver writes next carries the new URL, port and token.
 *
 * Exports: createPrepareRun().
 * Depends on: node:fs/promises, node:path, @forge/core (RunRequest, InvalidInputError),
 *   @forge/hooks (linkResumedGeneration), @forge/drivers (PreparedRun type), types/prepare-run.
 *   IO: creates the run directory, writes the secret and the resume link.
 */

import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { InvalidInputError } from '@forge/core';
import type { RunRequest } from '@forge/core';
import { linkResumedGeneration } from '@forge/hooks';
import type { PreparedRun } from '@forge/drivers';
import type { PrepareRunOptions } from '#/types/prepare-run.types.js';

/** Builds the `prepareRun` port of the Claude driver. */
export function createPrepareRun(
  opts: PrepareRunOptions,
): (req: RunRequest) => Promise<PreparedRun> {
  return async (req) => {
    const token = req.env['FORGE_RUN_TOKEN'];
    if (!token) {
      throw new InvalidInputError(
        `run ${req.runId} has no FORGE_RUN_TOKEN in its request`,
      );
    }

    const runDir = join(opts.runsDir, req.runId);
    await mkdir(runDir, { recursive: true });
    const generation = req.generation ?? 1;
    const creds = await opts.registry.register(req.runId, token, generation);
    if (generation > 1) {
      const now = opts.now ?? Date.now;
      await linkResumedGeneration(
        opts.receipts,
        req.runId,
        generation,
        creds.secret,
        new Date(now()).toISOString(),
      );
    }

    return {
      runDir,
      mcpServers: [
        {
          name: req.mcpIdentity,
          command: opts.nodePath,
          args: [opts.mcpEntry],
          env: {
            FORGE_RUN_ID: req.runId,
            FORGE_RUN_TOKEN: token,
            FORGE_DB_PATH: opts.dbPath,
          },
        },
      ],
      env: { FORGE_RUN_ID: req.runId },
      hookServerUrl: opts.hookBaseUrl(),
      hookToken: token,
    };
  };
}
