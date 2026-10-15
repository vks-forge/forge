/**
 * `forge status`: is Forge running, and since when.
 *
 * Why: before filing work or opening the control room the user needs a one-glance answer, and
 *   a script needs it as an exit code. The health route deliberately says almost nothing (it
 *   is open to every local program), so the details come from `server.json`: pid, port,
 *   start time and build. Exit 0 means running; 3 means not running (the convention of
 *   service managers), which keeps "not running" distinct from a command that failed (1).
 *   A stale record or a process that does not answer is described, not hidden, because each
 *   needs a different next step.
 *
 * Exports: describeUptime(), serverStatus().
 * Depends on: services/daemon/find-server, types/daemon. IO: through the ports.
 */

import { findServer, serverUrl } from '#/services/daemon/find-server.js';
import type { DaemonPorts } from '#/types/daemon.types.js';

export const NOT_RUNNING_EXIT = 3;

/** `1d 2h`, `3h 4m`, `5m 6s`, `7s`: the two largest non-zero units. */
export function describeUptime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const units = [
    ['d', Math.floor(total / 86_400)],
    ['h', Math.floor(total / 3_600) % 24],
    ['m', Math.floor(total / 60) % 60],
    ['s', total % 60],
  ] as const;

  const shown = units.filter(([, value]) => value > 0).slice(0, 2);

  return shown.length === 0
    ? '0s'
    : shown.map(([unit, value]) => `${value}${unit}`).join(' ');
}

/** Runs the command; resolves with the exit code. */
export async function serverStatus(ports: DaemonPorts): Promise<number> {
  const state = await findServer(ports);

  if (state.kind === 'running') {
    const { record } = state;
    const uptime = describeUptime(ports.now() - Date.parse(record.startedAt));
    ports.stdout(
      [
        'Forge is running',
        `  url:     ${serverUrl(record.port)}`,
        `  pid:     ${record.pid}`,
        `  uptime:  ${uptime}`,
        `  version: ${record.version}`,
        ...(state.health === 'degraded'
          ? ['  health:  degraded (the database does not answer)']
          : []),
        '',
      ].join('\n'),
    );

    return 0;
  }

  if (state.kind === 'unresponsive') {
    ports.stdout(
      `Forge is not answering: process ${state.record.pid} is alive but port ${state.record.port} gives no /health (starting, hung, or shutting down)\n`,
    );

    return NOT_RUNNING_EXIT;
  }

  ports.stdout(
    state.kind === 'stale'
      ? `Forge is not running (server.json is left over from process ${state.record.pid}, which has ended)\n`
      : 'Forge is not running\n',
  );

  return NOT_RUNNING_EXIT;
}
