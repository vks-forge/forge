/**
 * Starts the server for a process and stops it on SIGINT/SIGTERM or `POST /admin/shutdown`.
 *
 * Why: `main.ts` must stay a one-liner (code.md rule 1) and a startup failure must be a
 *   readable message and a non-zero exit, not an unhandled rejection stack. Process effects
 *   (env, exit, stderr, signals, pid) are injected, so "bad config exits 1" and "SIGTERM runs
 *   the graceful shutdown once" are unit tests, not subprocess tests. A second signal while
 *   shutting down forces exit 130 at once, so a stuck shutdown never traps the operator;
 *   the shutdown itself is also bounded (services/shutdown.ts). This is also where the
 *   process takes its single-instance lock before it opens the database, publishes
 *   `server.json` once it listens (so `forge status` and `forge stop` can find it), and
 *   removes both after a clean shutdown. The admin shutdown request takes the same path as a
 *   signal, so Windows (where a detached process gets no SIGTERM) shuts down identically.
 *
 * Exports: runServer().
 * Depends on: config/{load-settings,version}, services/assemble, services/claude-ports,
 *   services/instance/{instance-lock,server-record}, types/process. IO: through the
 *   injected `ProcessIo`, plus the lock and record files in the data home.
 */

import { mkdir } from 'node:fs/promises';
import { createJsonLogger } from '@forge/engine';
import { loadSettings } from '#/config/load-settings.js';
import { readServerVersion } from '#/config/version.js';
import { assembleServer } from '#/services/assemble.js';
import { createClaudePorts } from '#/services/claude-ports.js';
import { acquireInstanceLock } from '#/services/instance/instance-lock.js';
import {
  removeServerRecord,
  writeServerRecord,
} from '#/services/instance/server-record.js';
import type { InstanceLock } from '#/types/auth.types.js';
import type { PortsFactory, ProcessIo } from '#/types/process.types.js';
import type { ForgeServer } from '#/types/server.types.js';

const claudePorts: PortsFactory = (settings, io) =>
  createClaudePorts(settings, createJsonLogger(io.stderr, 'info'));

/** Loads, assembles and starts the server; resolves with it, or null after exiting 1. */
export async function runServer(
  io: ProcessIo,
  makePorts: PortsFactory = claudePorts,
): Promise<ForgeServer | null> {
  let lock: InstanceLock | null = null;
  try {
    const settings = await loadSettings(io.env, io.cwd);
    const { data } = settings.layout;

    // The lock comes first: a second server must never open the database of the first.
    await mkdir(data.home, { recursive: true });
    lock = await acquireInstanceLock(data.serverLockPath, io);

    let stopping = false;
    let server: ForgeServer | null = null;
    const shutdown = (signal: string): void => {
      if (stopping) {
        io.stderr(`${signal} received again, forcing exit\n`);

        io.exit(130);

        return;
      }

      stopping = true;
      io.stderr(`${signal} received, shutting down\n`);
      (server as ForgeServer).stop().then(
        async () => {
          await removeServerRecord(data.serverJsonPath, io.pid);
          await lock?.release();
          io.exit(0);
        },
        () => io.exit(1),
      );
    };

    server = await assembleServer(settings, makePorts(settings, io), {
      onShutdownRequested: () => shutdown('shutdown request'),
    });

    const address = await server.start();
    await writeServerRecord(data.serverJsonPath, {
      pid: io.pid,
      port: address.port,
      startedAt: new Date().toISOString(),
      version: await readServerVersion(),
    });

    io.stderr(`forge server ${server.owner} listening on ${address.url}\n`);
    io.onSignal('SIGINT', shutdown);
    io.onSignal('SIGTERM', shutdown);

    return server;
  } catch (error) {
    await lock?.release();
    io.stderr(
      `forge-server: ${error instanceof Error ? error.message : 'startup failed'}\n`,
    );

    io.exit(1);

    return null;
  }
}
