/**
 * Lists, and with `--apply` deletes, old `forge*` folders in the OS temp directory.
 *
 * Why: before tests cleaned up after themselves, thousands of fixture repos and data
 *   homes piled up in the temp folder. This removes that backlog on demand. It is a dry
 *   run unless `--apply` is given, and only considers folders whose name starts with
 *   `forge` and that were last modified more than an hour ago, so a run in progress is
 *   never touched. Errors on single folders are counted and skipped.
 *
 * Exports: none (script). Usage: node scripts/clean-temp.mjs [--apply]
 * Depends on: node:fs, node:os, node:path. IO: deletes old temp folders with --apply.
 */

import { readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const MAX_AGE_MS = 60 * 60 * 1000;
const apply = process.argv.includes('--apply');
const root = tmpdir();
const cutoff = Date.now() - MAX_AGE_MS;

/** Total size in bytes of a folder; unreadable entries count as zero. */
function sizeOf(path) {
  let total = 0;
  let entries = [];
  try {
    entries = readdirSync(path, { withFileTypes: true });
  } catch {
    return 0;
  }

  for (const entry of entries) {
    const child = join(path, entry.name);
    try {
      total += entry.isDirectory() ? sizeOf(child) : statSync(child).size;
    } catch {
      // vanished or locked: skip
    }
  }

  return total;
}

const old = [];
for (const name of readdirSync(root)) {
  if (!/^forge[-_ ]/i.test(name)) {
    continue;
  }

  try {
    const stats = statSync(join(root, name));
    if (stats.isDirectory() && stats.mtimeMs < cutoff) {
      old.push(join(root, name));
    }
  } catch {
    // vanished: skip
  }
}

if (!apply) {
  const bytes = old.reduce((sum, path) => sum + sizeOf(path), 0);
  console.log(
    `${old.length} forge* folders older than 1 hour in ${root} (${(bytes / 1048576).toFixed(1)} MiB).`,
  );

  console.log('Dry run. Pass --apply to delete them.');
} else {
  let removed = 0;
  let failed = 0;
  for (const path of old) {
    try {
      rmSync(path, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      removed += 1;
    } catch {
      failed += 1;
    }
  }

  console.log(
    `Removed ${removed} folders, ${failed} could not be removed (of ${old.length}).`,
  );
}
