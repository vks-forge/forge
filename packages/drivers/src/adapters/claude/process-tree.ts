/**
 * Kills a harness child together with everything it started.
 *
 * Why: the harness spawns its own children (the bundled `claude`, MCP servers, shells the
 *   Worker ran). Killing only the process we started would leave those running, holding
 *   the worktree open and spending money. On Windows there are no process groups, so the
 *   tree is taken down with `taskkill /T /F /PID`; elsewhere the child was started in its
 *   own group and the whole group gets the signal. A failed kill falls back to killing the
 *   single child, because a half-dead run is worse than a loud one.
 *
 * Exports: killTree().
 * Depends on: types/claude/driver-deps. IO: sends signals, may spawn `taskkill`.
 */

import type { ChildLike, KillTreeOptions } from '#/types/claude/driver-deps.types.js';

/** Forcefully ends `child` and its descendants; resolves when the kill has been issued. */
export async function killTree(
  child: ChildLike,
  options: KillTreeOptions,
): Promise<void> {
  const pid = child.pid;
  if (pid === undefined) {
    child.kill('SIGKILL');
    return;
  }
  if (options.platform === 'win32') {
    await new Promise<void>((resolve) => {
      try {
        const killer = options.spawn('taskkill', ['/T', '/F', '/PID', String(pid)], {});
        killer.on('exit', () => resolve());
        killer.on('error', () => resolve());
      } catch {
        resolve();
      }
    });
    child.kill('SIGKILL');
    return;
  }
  const signalGroup = options.signalGroup ?? ((p, s) => process.kill(-p, s));
  try {
    signalGroup(pid, 'SIGKILL');
  } catch {
    child.kill('SIGKILL');
  }
}
