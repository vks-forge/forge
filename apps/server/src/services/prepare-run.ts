/**
 * Prepares one run for the Worker driver: run directory, credentials, MCP entry, hook URL.
 *
 * Why: the driver starts a harness but owns neither the run's token nor its place on disk.
 *   This is the app's half of starting a run (d-0033, d-0054). The engine already issued the
 *   token and stored only its hash; here the same token is registered with a fresh HMAC
 *   secret in memory, a run directory is created under `<dataHome>/runs/<id>/` (outside
 *   the worktree, so the Worker cannot edit what the hook reads), and the per-run MCP
 *   server is described so the harness can launch `apps/mcp` with exactly this run's id,
 *   token and database path. The hook is told the server's base URL, which is only known
 *   once the port is bound, so it is read lazily.
 *
 * Exports: createPrepareRun().
 * Depends on: node:fs/promises, node:path, @forge/core (RunRequest, InvalidInputError),
 *   @forge/drivers (PreparedRun type), types/prepare-run. IO: creates the run directory.
 */

import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { InvalidInputError } from '@forge/core';
import type { RunRequest } from '@forge/core';
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
    opts.registry.register(req.runId, token);

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
