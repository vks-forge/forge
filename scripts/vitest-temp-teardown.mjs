/**
 * Vitest global setup: sweeps `forge-*` temp folders this test run left behind.
 *
 * Why: tests build fixture repos, data homes and worktrees in the OS temp folder, and on
 *   Windows a per-test removal can fail (EBUSY/EPERM) or a crashed worker can skip its
 *   teardown, so folders pile up run after run (16,000 once). Every test file removes its
 *   own; this is the safety net that runs once after the whole suite. It only touches
 *   folders that start with `forge` and were modified at or after this run started, so
 *   anything older, or belonging to another program, is never deleted.
 *
 * Exports: default setup function (returns the teardown), isRunTempDir().
 * Depends on: node:fs, node:os, node:path. IO: deletes temp folders created during the run.
 */

import { readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** True for a `forge*` name modified at or after `startMs` (the run's start). */
export function isRunTempDir(name, mtimeMs, startMs) {
  return /^forge[-_ ]/i.test(name) && mtimeMs >= startMs;
}

export default function setup() {
  // Small slack for coarse filesystem timestamps.
  const startMs = Date.now() - 2000;

  return function teardown() {
    const root = tmpdir();
    let names = [];
    try {
      names = readdirSync(root);
    } catch {
      return;
    }

    for (const name of names) {
      const path = join(root, name);
      try {
        const stats = statSync(path);
        if (stats.isDirectory() && isRunTempDir(name, stats.mtimeMs, startMs)) {
          rmSync(path, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
        }
      } catch {
        // Teardown never fails the run: a busy or vanished folder is left for clean-temp.
      }
    }
  };
}
