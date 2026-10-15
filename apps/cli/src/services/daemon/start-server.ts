/**
 * `forge start`: make sure Forge is running in the background and print where.
 *
 * Why: the user wants Forge to keep working after the terminal closes, and wants one
 *   command that is safe to run twice. So it first looks for a live server (recorded process
 *   exists and answers `/health`) and, if there is one, only prints its URL. Otherwise it
 *   starts the built server detached and waits until the new process has published
 *   `server.json` and answers `/health`, because "spawned" is not "usable". If the process
 *   dies while starting (port taken, bad config, another server won the lock) the user gets
 *   the last lines the server wrote, which already say why in plain words; there is no
 *   silent hop to another port. It prints the URL only: handing the browser the install
 *   token comes with the control room.
 *
 * Exports: START_TIMEOUT_MS, startServer().
 * Depends on: services/daemon/find-server, types/daemon. IO: through the ports.
 */

import {
  findServer,
  readServerRecord,
  serverUrl,
} from '#/services/daemon/find-server.js';
import type { DaemonPorts } from '#/types/daemon.types.js';

export const START_TIMEOUT_MS = 20_000;
const POLL_MS = 250;
const LOG_LINES_SHOWN = 8;

function describeRunning(pid: number, port: number): string {
  return `${serverUrl(port)} (pid ${pid})\n`;
}

/** Runs the command; resolves with the exit code. */
export async function startServer(
  ports: DaemonPorts,
  timeoutMs: number = START_TIMEOUT_MS,
): Promise<number> {
  const existing = await findServer(ports);
  if (existing.kind === 'running') {
    ports.stdout(
      `Forge is already running at ${describeRunning(existing.record.pid, existing.record.port)}`,
    );

    return 0;
  }

  if (existing.kind === 'unresponsive') {
    ports.stderr(
      `forge: a Forge server (pid ${existing.record.pid}) is recorded but does not answer on port ${existing.record.port}; run \`forge stop\` or end that process first\n`,
    );

    return 1;
  }

  const child = await ports.spawnServer();
  const deadline = ports.now() + timeoutMs;

  for (;;) {
    const record = await readServerRecord(ports);
    if (record?.pid === child.pid) {
      const health = await ports.health(record.port);
      if (health === 'ok' || health === 'degraded') {
        ports.stdout(`Forge is running at ${describeRunning(child.pid, record.port)}`);
        ports.stdout(`Logs: ${child.logPath}\n`);

        return 0;
      }
    }

    if (!ports.isAlive(child.pid)) {
      return reportStopped(ports, child.logStart);
    }

    if (ports.now() >= deadline) {
      ports.stderr(
        `forge: the server (pid ${child.pid}) did not answer on /health within ${Math.round(timeoutMs / 1000)} s; see ${child.logPath}\n`,
      );

      return 1;
    }

    await ports.sleep(POLL_MS);
  }
}

/** The new process is gone: either another start won, or it failed and its log says why. */
async function reportStopped(ports: DaemonPorts, logStart: number): Promise<number> {
  const winner = await findServer(ports);
  if (winner.kind === 'running') {
    ports.stdout(
      `Forge is already running at ${describeRunning(winner.record.pid, winner.record.port)}`,
    );

    return 0;
  }

  const lines = (await ports.readLog(logStart))
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
    .slice(-LOG_LINES_SHOWN);

  ports.stderr(
    `forge: the server stopped while starting${lines.length > 0 ? ':' : ''}\n${lines
      .map((line) => `  ${line}\n`)
      .join('')}`,
  );

  return 1;
}
