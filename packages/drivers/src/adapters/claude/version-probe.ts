/**
 * Runs `<binary> --version` and returns the first version number it prints.
 *
 * Why: `preflight()` has to tell the Director, before any money is spent, that the harness
 *   is installed and which build it is. Forge runs the user's installed `claude` (d-0087),
 *   so the version is information to record and check per install (d-0088), and an adapter
 *   that drifted from its pin must show up as a preflight issue, not as a surprise mid-run.
 *   A missing binary, a hang and a garbled answer all map to `null` so the caller reports
 *   "missing binary" instead of throwing.
 *
 * Exports: probeVersion().
 * Depends on: adapters/claude/capture-output, types/claude/driver-deps. IO: spawns one
 *   short-lived process.
 */

import { captureOutput } from '#/adapters/claude/capture-output.js';
import type { Clock, SpawnFn } from '#/types/claude/driver-deps.types.js';

const VERSION_TIMEOUT_MS = 15_000;
const SEMVER = /\d+\.\d+\.\d+/;

/** First `x.y.z` printed by the command, or null if it is missing, hangs or prints none. */
export async function probeVersion(
  spawn: SpawnFn,
  clock: Clock,
  command: string,
  args: readonly string[],
  env: Readonly<Record<string, string>>,
): Promise<string | null> {
  const out = await captureOutput(spawn, clock, command, args, env, {
    timeoutMs: VERSION_TIMEOUT_MS,
  });

  return out === null ? null : (SEMVER.exec(out)?.[0] ?? null);
}
