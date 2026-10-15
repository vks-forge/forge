/**
 * Is a process with this pid running?
 *
 * Why: the single-instance lock outlives a crashed server, so a stale lock is told apart from
 *   a live one by asking the OS whether the owner still exists. `kill(pid, 0)` sends no signal
 *   and only checks: `ESRCH` means gone, `EPERM` means it exists but belongs to someone else
 *   (alive for our purpose). On Windows Node implements it with `OpenProcess`.
 *
 * Exports: processIsAlive().
 * Depends on: node:process. IO: queries the process table.
 */

/** True when `pid` names a live process. */
export function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);

    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}
