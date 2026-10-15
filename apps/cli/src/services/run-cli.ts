/**
 * Runs one `forge` command against injected ports and returns the exit code.
 *
 * Why: `main.ts` must stay a thin composition root (apps hold no logic), yet the dispatch,
 *   error-to-message mapping and exit codes need tests. Keeping them here, over ports,
 *   lets a test run a whole command line against an in-memory store and a fake filesystem.
 *   Errors are printed as one plain line, never a stack, and the exit code says whether
 *   it was a usage mistake (2) or a failure (1).
 *
 * Exports: runCli().
 * Depends on: @forge/core (ForgeError, InvalidInputError), services/{parse-args,secret-wrap},
 *   services/daemon/{open-ui,start-server,server-status,stop-server}, types/cli. IO: through the injected ports only.
 */

import { ForgeError, InvalidInputError } from '@forge/core';
import { openUi } from '#/services/daemon/open-ui.js';
import { serverStatus } from '#/services/daemon/server-status.js';
import { startServer } from '#/services/daemon/start-server.js';
import { stopServer } from '#/services/daemon/stop-server.js';
import { parseCommand, USAGE } from '#/services/parse-args.js';
import { describeWrap, wrapSecret } from '#/services/secret-wrap.js';
import type { CliDeps } from '#/types/cli.types.js';

/** Executes `argv` (without node and script) and returns the process exit code. */
export async function runCli(argv: readonly string[], deps: CliDeps): Promise<number> {
  try {
    const command = parseCommand(argv);
    if (command.kind === 'help') {
      deps.stdout(USAGE);

      return 0;
    }

    if (command.kind === 'start') {
      return await startServer(deps.daemon, { open: command.open });
    }

    if (command.kind === 'open') {
      return await openUi(deps.daemon, command.open);
    }

    if (command.kind === 'status') {
      return await serverStatus(deps.daemon);
    }

    if (command.kind === 'stop') {
      return await stopServer(deps.daemon);
    }

    const store = await deps.openStore();
    const result = await wrapSecret({ ...deps, store }, command.name, command.file);
    deps.stdout(describeWrap(result));

    return 0;
  } catch (error) {
    if (error instanceof InvalidInputError) {
      deps.stderr(`forge: ${error.message}\n\n${USAGE}`);

      return 2;
    }

    const message =
      error instanceof ForgeError || error instanceof Error
        ? error.message
        : String(error);

    deps.stderr(`forge: ${message}\n`);

    return 1;
  }
}
