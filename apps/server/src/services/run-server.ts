/**
 * Starts the server for a process and stops it on SIGINT/SIGTERM.
 *
 * Why: `main.ts` must stay a one-liner (code.md rule 1) and a startup failure must be a
 *   readable message and a non-zero exit, not an unhandled rejection stack. Process effects
 *   (env, exit, stderr, signals) are injected, so "bad config exits 1" and "SIGTERM runs the
 *   graceful shutdown once" are unit tests, not subprocess tests. A second signal while
 *   shutting down forces exit 130 at once, so a stuck shutdown never traps the operator;
 *   the shutdown itself is also bounded (services/shutdown.ts).
 *
 * Exports: runServer().
 * Depends on: config/load-settings, services/assemble, services/claude-ports,
 *   services/logger, types/process. IO: through the injected `ProcessIo`.
 */

import { createJsonLogger } from '@forge/engine';
import { loadSettings } from '#/config/load-settings.js';
import { assembleServer } from '#/services/assemble.js';
import { createClaudePorts } from '#/services/claude-ports.js';
import type { PortsFactory, ProcessIo } from '#/types/process.types.js';
import type { ForgeServer } from '#/types/server.types.js';

const claudePorts: PortsFactory = (settings, io) =>
  createClaudePorts(settings, createJsonLogger(io.stderr, 'info'));

/** Loads, assembles and starts the server; resolves with it, or null after exiting 1. */
export async function runServer(
  io: ProcessIo,
  makePorts: PortsFactory = claudePorts,
): Promise<ForgeServer | null> {
  try {
    const settings = await loadSettings(io.env, io.cwd);
    const server = await assembleServer(settings, makePorts(settings, io));
    const address = await server.start();
    io.stderr(`forge server ${server.owner} listening on ${address.url}\n`);

    let stopping = false;
    const onSignal = (signal: string): void => {
      if (stopping) {
        io.stderr(`${signal} received again, forcing exit
`);

        io.exit(130);

        return;
      }

      stopping = true;
      io.stderr(`${signal} received, shutting down\n`);
      server.stop().then(
        () => io.exit(0),
        () => io.exit(1),
      );
    };

    io.onSignal('SIGINT', onSignal);
    io.onSignal('SIGTERM', onSignal);

    return server;
  } catch (error) {
    io.stderr(
      `forge-server: ${error instanceof Error ? error.message : 'startup failed'}\n`,
    );

    io.exit(1);

    return null;
  }
}
