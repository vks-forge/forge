/**
 * Canonical form of a path on disk, for comparing paths that name the same folder.
 *
 * Why: the user types a folder one way (a Windows 8.3 short name such as `RUNNER~1`, a
 *   symlinked `/var/folders` on macOS, a junction) while git reports the same folder in its
 *   physical spelling. Comparing the two strings refuses a valid clone root as "inside a
 *   repository" or misses that a worktree already exists. Resolving both sides to the real
 *   path first makes equality mean "same folder". A path that does not exist yet (a
 *   worktree about to be created) is resolved through its nearest existing parent.
 *
 * Exports: canonicalPath().
 * Depends on: node:fs, node:path. IO: resolves real paths.
 */

import { realpathSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

const MAX_CLIMB = 64;

/** Real path of `p` (native, so Windows short names expand), or of its nearest existing parent plus the missing tail. */
export function canonicalPath(p: string): string {
  let current = resolve(p);
  let tail = '';
  for (let i = 0; i < MAX_CLIMB; i++) {
    try {
      const real = realpathSync.native(current);

      return tail === '' ? real : join(real, tail);
    } catch {
      const parent = dirname(current);
      if (parent === current) {
        break;
      }

      tail = tail === '' ? basename(current) : join(basename(current), tail);
      current = parent;
    }
  }

  return resolve(p);
}
