/**
 * Gating and artefact paths for the server's live probes.
 *
 * Why: a live probe drives the real Claude harness on the operator's subscription, so it
 *   must never run in plain `pnpm test`. It is skipped unless `FORGE_PROBES=1` (set by
 *   `pnpm probes`), and everything it writes goes under the gitignored
 *   `.forge/data/probes/<n>/`, never into the working tree.
 *
 * Exports: PROBES_ENABLED, SKIP_REASON, probeDir().
 * Depends on: node:fs, node:path, node:url. IO: creates a directory.
 */

import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));

/** True only when the operator asked for the live probes. */
export const PROBES_ENABLED = process.env['FORGE_PROBES'] === '1';

/** Shown in the test title so a skipped probe says why. */
export const SKIP_REASON = '[skipped unless FORGE_PROBES=1; run `pnpm probes`]';

/** A fresh `.forge/data/probes/<name>/` directory. */
export function probeDir(name: string): string {
  const dir = join(REPO_ROOT, '.forge', 'data', 'probes', name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });

  return dir;
}
