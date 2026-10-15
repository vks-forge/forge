/**
 * `forge stop`: shut the background server down cleanly and wait until it is gone.
 *
 * Why: a detached server has no terminal to Ctrl-C, and Windows gives it no graceful signal,
 *   so the stop request goes through the API (`POST /admin/shutdown`, install token) and runs
 *   the same shutdown as Ctrl-C: live Workers are cancelled, gate jobs get their grace window,
 *   the port and the database close. The command then waits for the process to actually end
 *   (it can legitimately take up to the shutdown grace window), because "asked" is not
 *   "stopped" and a script that runs `forge stop` then `forge start` must not race the old
 *   process for the lock. After the wait it says so and exits 1 instead of killing: forcing a
 *   server mid-merge is the user's call.
 *
 * Exports: STOP_TIMEOUT_MS, stopServer().
 * Depends on: services/daemon/find-server, services/daemon/install-token, types/daemon.
 *   IO: through the ports.
 */

import { findServer } from '#/services/daemon/find-server.js';
import { readInstallToken } from '#/services/daemon/install-token.js';
import type { DaemonPorts } from '#/types/daemon.types.js';

export const STOP_TIMEOUT_MS = 35_000;
const POLL_MS = 250;

/** Runs the command; resolves with the exit code. */
export async function stopServer(
  ports: DaemonPorts,
  timeoutMs: number = STOP_TIMEOUT_MS,
): Promise<number> {
  const state = await findServer(ports);
  if (state.kind === 'absent' || state.kind === 'stale') {
    ports.stdout('Forge is not running\n');

    return 0;
  }

  const { pid, port } = state.record;
  if (state.kind === 'unresponsive') {
    // Not proven to be Forge answering, so the install token is not sent to that port.
    ports.stderr(
      `forge: process ${pid} is alive but port ${port} does not answer as a Forge server, so it was not asked to stop; end it yourself if it is stuck\n`,
    );

    return 1;
  }

  const token = await readInstallToken(ports);

  if (!(await ports.proveToken(port, token))) {
    ports.stderr(
      `forge: something else is answering on port ${port}; Forge is not running there, so nothing was sent to it\n`,
    );

    return 1;
  }

  let status: number;
  try {
    status = await ports.shutdown(port, token);
  } catch {
    ports.stderr(
      `forge: process ${pid} answered /health but not the stop request on port ${port}; check \`forge status\`\n`,
    );

    return 1;
  }

  if (status === 401) {
    ports.stderr(
      'forge: the server refused the install token; this CLI and the server use different data homes\n',
    );

    return 1;
  }

  if (status !== 202) {
    ports.stderr(`forge: the server answered ${status} to the stop request\n`);

    return 1;
  }

  const deadline = ports.now() + timeoutMs;
  while (ports.isAlive(pid)) {
    if (ports.now() >= deadline) {
      ports.stderr(
        `forge: the server (pid ${pid}) was asked to stop but is still running after ${Math.round(timeoutMs / 1000)} s; it may be finishing a gate job, check \`forge status\` again\n`,
      );

      return 1;
    }

    await ports.sleep(POLL_MS);
  }

  ports.stdout('Forge stopped\n');

  return 0;
}
