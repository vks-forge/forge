/**
 * Path guard: is a folder the user names inside Forge's own storage?
 *
 * Why: a project's `local_path` is the clone the Director reads and merges into, and the
 *   data home holds what the Director itself writes (the database, run secrets, each
 *   project's private memory repository, every Worker worktree). A project pointed at
 *   `<dataHome>/memory/<slug>` or at a worktree folder would make Forge's own working
 *   files the "source" of a project, so a Worker could edit the Director's memory or a
 *   sibling ticket's tree as if it were the repository, which inverts the floor between
 *   what Workers may touch and what only the Director writes. The check runs on the plain
 *   path and on the real path (junctions and symlinks resolved), because a link that
 *   leads into the data home is the same hole.
 *
 * Exports: isInside(), insideForgeStorage().
 * Depends on: node:fs/promises, node:path. IO: resolves real paths.
 */

import { realpath } from 'node:fs/promises';
import { relative, resolve, isAbsolute } from 'node:path';

/** True when `child` is `parent` or lies below it; compares case-insensitively on Windows. */
export function isInside(parent: string, child: string): boolean {
  const fold = (p: string): string =>
    process.platform === 'win32' ? resolve(p).toLowerCase() : resolve(p);

  const rel = relative(fold(parent), fold(child));

  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

/** The real path of `path`, or null when it does not exist (the repository check refuses it later). */
async function realOrNull(path: string): Promise<string | null> {
  try {
    return await realpath(path);
  } catch {
    return null;
  }
}

/**
 * The root in `roots` that `path` lies in, by plain path or by real path; null when none.
 * Each root is also tried by its real path, so a data home reached through a link is covered.
 */
export async function insideForgeStorage(
  path: string,
  roots: readonly string[],
): Promise<string | null> {
  const real = await realOrNull(path);
  for (const root of roots) {
    const realRoot = await realOrNull(root);
    const hit = [path, real].some(
      (candidate) =>
        candidate !== null &&
        (isInside(root, candidate) ||
          (realRoot !== null && isInside(realRoot, candidate))),
    );

    if (hit) {
      return root;
    }
  }

  return null;
}
