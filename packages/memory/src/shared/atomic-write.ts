/**
 * Atomic file write: temp file in the same volume, then rename over the target.
 *
 * Why: a crash or a power cut in the middle of writing a record must leave either the old
 *   file or the new one, never half of a decision the Director will plan against. The
 *   temp file lives under `.git/` so a leftover can never be committed as memory.
 *
 * Exports: writeFileAtomic(), removeFile().
 * Depends on: node:fs/promises, node:path, node:crypto.
 */

import { randomUUID } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/** Writes `text` to `path` (creating folders) so readers see the old or the new content only. */
export async function writeFileAtomic(
  repoDir: string,
  path: string,
  text: string,
): Promise<void> {
  const tmpDir = join(repoDir, '.git', 'forge-tmp');
  await mkdir(tmpDir, { recursive: true });
  await mkdir(dirname(path), { recursive: true });

  const tmp = join(tmpDir, `${randomUUID()}.tmp`);
  await writeFile(tmp, text, 'utf8');
  await rename(tmp, path);
}

/** Deletes a file; a file that is already gone is fine. */
export async function removeFile(path: string): Promise<void> {
  await rm(path, { force: true });
}
