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
 *   silent hop to another port. A cold start on a loaded machine takes around 22 s, so the
 *   wait is 60 s, with a progress line every few seconds so a slow start does not look hung,
 *   and one last look at `server.json` and `/health` before giving up (the server may have
 *   come up during the last poll). Once the server answers it opens the browser on a
 *   one-time sign-in link (`--no-open` skips that); a browser that cannot launch never
 *   fails the start.
 *
 * Exports: START_TIMEOUT_MS, PROGRESS_EVERY_MS, startServer().
 * Depends on: services/daemon/{find-server,open-ui}, types/daemon. IO: through the ports.
 */

import {
  findServer,
  readServerRecord,
  serverUrl,
} from '#/services/daemon/find-server.js';
import { showLink } from '#/services/daemon/open-ui.js';
import type { DaemonPorts } from '#/types/daemon.types.js';

export const START_TIMEOUT_MS = 60_000;
export const PROGRESS_EVERY_MS = 5_000;
const POLL_MS = 250;
const LOG_LINES_SHOWN = 8;

function describeRunning(pid: number, port: number): string {
  return `${serverUrl(port)} (pid ${pid})\n`;
}

/** Opens the browser on a sign-in link; a failure is reported and never fails the start. */
async function signIn(ports: DaemonPorts, port: number, launch: boolean): Promise<void> {
  if (!launch) {
    return;
  }

  try {
    await showLink(ports, port, launch);
  } catch (error) {
    ports.stderr(
      `forge: Forge is running but no sign-in link could be made (${error instanceof Error ? error.message : 'unknown error'}); try \`forge open\`
`,
    );
  }
}

/** Runs the command; resolves with the exit code. */
export async function startServer(
  ports: DaemonPorts,
  options: { readonly open?: boolean; readonly timeoutMs?: number } = {},
): Promise<number> {
  const launch = options.open ?? true;
  const timeoutMs = options.timeoutMs ?? START_TIMEOUT_MS;
  const existing = await findServer(ports);
  if (existing.kind === 'running') {
    ports.stdout(
      `Forge is already running at ${describeRunning(existing.record.pid, existing.record.port)}`,
    );

    await signIn(ports, existing.record.port, launch);

    return 0;
  }

  if (existing.kind === 'unresponsive') {
    ports.stderr(
      `forge: a Forge server (pid ${existing.record.pid}) is recorded but does not answer on port ${existing.record.port}; run \`forge stop\` or end that process first\n`,
    );

    return 1;
  }

  const child = await ports.spawnServer();
  const startedAt = ports.now();
  const deadline = startedAt + timeoutMs;
  let nextProgress = startedAt + PROGRESS_EVERY_MS;
  ports.stdout(
    `Starting Forge (pid ${child.pid}); this can take up to ${Math.round(timeoutMs / 1000)} s on a busy machine...\n`,
  );

  /** The port of the new server once it has published itself and answers, else undefined. */
  const upPort = async (): Promise<number | undefined> => {
    const record = await readServerRecord(ports);
    if (record?.pid !== child.pid) {
      return undefined;
    }

    const health = await ports.health(record.port);

    return health === 'ok' || health === 'degraded' ? record.port : undefined;
  };

  const report = async (port: number): Promise<number> => {
    ports.stdout(`Forge is running at ${describeRunning(child.pid, port)}`);
    ports.stdout(`Logs: ${child.logPath}\n`);
    await signIn(ports, port, launch);

    return 0;
  };

  for (;;) {
    const port = await upPort();
    if (port !== undefined) {
      return report(port);
    }

    if (!ports.isAlive(child.pid)) {
      return reportStopped(ports, child.logStart);
    }

    if (ports.now() >= deadline) {
      // The server may have come up while the last poll was in flight: look once more.
      const last = await upPort();
      if (last !== undefined) {
        return report(last);
      }

      ports.stderr(
        `forge: the server (pid ${child.pid}) did not answer on /health within ${Math.round(timeoutMs / 1000)} s; see ${child.logPath}\n`,
      );

      return 1;
    }

    if (ports.now() >= nextProgress) {
      ports.stdout(
        `  still starting (${Math.round((ports.now() - startedAt) / 1000)} s)...\n`,
      );

      nextProgress += PROGRESS_EVERY_MS;
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
