/**
 * Temporary directories for tests: tracked, removed after the file, never a failure.
 *
 * Why: tests that spawn git, node or a harness fake leave directories in the OS temp folder
 *   unless something removes them, and a run of the suite on a developer machine used to
 *   leave thousands. On Windows a removal can fail with EBUSY/EPERM for a moment after a
 *   child exits (antivirus, a lingering git handle), and failing a test over a temp
 *   directory it already passed would only hide real failures behind noise. So removal
 *   retries, and if the directory still cannot go it is left with a one-line warning.
 *   Directories made through `makeTempDir` are removed when the test file ends; a test
 *   that removes its own earlier (`removeTree`) loses nothing. Product code reports a folder
 *   in git's canonical spelling, but `os.tmpdir()` is not canonical on every CI runner (macOS
 *   `/var` is a symlink to `/private/var`, Windows TEMP can be an 8.3 `RUNNER~1` name), so a
 *   test that compares a reported path to its temp folder builds that folder with
 *   `makeCanonicalTempDir`.
 *
 * Exports: makeTempDir(), makeCanonicalTempDir(), trackTemp(), removeTree().
 * Depends on: node:fs, node:fs/promises, node:os, node:path, vitest (afterAll). IO: temp directories.
 */

import { mkdtempSync, realpathSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll } from 'vitest';

const tracked = new Set<string>();

/** Removes `path` with retries; warns and returns when it cannot, never throws. */
export async function removeTree(path: string): Promise<void> {
  tracked.delete(path);
  try {
    await rm(path, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code ?? 'unknown';
    console.warn(`test cleanup: left ${path} behind (${code})`);
  }
}

/** Registers a directory the test created itself for removal after the file. */
export function trackTemp(path: string): string {
  tracked.add(path);

  return path;
}

/** `mkdtemp` under the OS temp directory, removed after the test file. */
export function makeTempDir(prefix: string): string {
  return trackTemp(mkdtempSync(join(tmpdir(), prefix)));
}

/** Like `makeTempDir`, but already resolved to the real path (`.native` also expands Windows 8.3 names). */
export function makeCanonicalTempDir(prefix: string): string {
  return trackTemp(realpathSync.native(mkdtempSync(join(tmpdir(), prefix))));
}

afterAll(async () => {
  await Promise.all([...tracked].map(removeTree));
}, 120_000);
