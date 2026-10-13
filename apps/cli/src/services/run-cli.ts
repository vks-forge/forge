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
 * Depends on: @forge/core (ForgeError, InvalidInputError), services/{parse-args,secret-wrap}, types/cli.
 *   IO: through the injected ports only.
 */

import { ForgeError, InvalidInputError } from '@forge/core';
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
