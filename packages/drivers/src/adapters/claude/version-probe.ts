/**
 * Runs `<binary> --version` and returns the first version number it prints.
 *
 * Why: `preflight()` has to tell the Director, before any money is spent, that the harness
 *   is installed and is the version Forge was measured against. Every measured fact about
 *   hooks, modes and budgets is tied to a pinned Claude Code build (d-0053), so an adapter
 *   or CLI that drifted must show up as a preflight issue, not as a surprise mid-run. A
 *   missing binary, a hang and a garbled answer all map to `null` so the caller reports
 *   "missing binary" instead of throwing.
 *
 * Exports: probeVersion().
 * Depends on: types/claude/driver-deps. IO: spawns one short-lived process.
 */

import type { Clock, SpawnFn } from '#/types/claude/driver-deps.types.js';

const VERSION_TIMEOUT_MS = 15_000;
const SEMVER = /\d+\.\d+\.\d+/;

/** First `x.y.z` printed by the command, or null if it is missing, hangs or prints none. */
export function probeVersion(
  spawn: SpawnFn,
  clock: Clock,
  command: string,
  args: readonly string[],
  env: Readonly<Record<string, string>>,
): Promise<string | null> {
  return new Promise((resolve) => {
    let out = '';
    let done = false;
    const finish = (value: string | null): void => {
      if (done) return;
      done = true;
      cancel();
      resolve(value);
    };
    let cancel = (): void => undefined;
    try {
      const child = spawn(command, args, { env });
      child.stdout.on('data', (chunk: Buffer) => (out += chunk.toString('utf8')));
      child.stdin.end();
      child.on('error', () => finish(null));
      // stdout 'end', not process 'exit': exit can fire before the last chunk is read.
      child.stdout.on('end', () => finish(SEMVER.exec(out)?.[0] ?? null));
      cancel = clock.after(VERSION_TIMEOUT_MS, () => {
        child.kill('SIGKILL');
        finish(null);
      });
    } catch {
      finish(null);
    }
  });
}
