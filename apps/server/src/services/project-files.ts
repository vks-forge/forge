/**
 * Removes the folders Forge itself created for a project.
 *
 * Why: deleting a project must free its memory repository and Worker worktrees (they only
 *   take disk and would show up again if the slug is re-added), but the user's own project
 *   folder is never Forge's to delete. Only the two per-slug folders under the data home
 *   are touched, and each path is checked to still sit inside its parent so a slug can never
 *   point the delete elsewhere. Windows often holds a file for a moment (an antivirus scan,
 *   a lingering git process), so the removal retries before giving up; a folder that stays
 *   locked is reported back instead of failing a delete whose database rows are already gone.
 *
 * Exports: removeProjectFiles().
 * Depends on: node:fs/promises, node:path, @forge/core (DataHomeLayout). IO: deletes folders.
 */

import { rm } from 'node:fs/promises';
import { isAbsolute, join, relative } from 'node:path';
import type { DataHomeLayout } from '@forge/core';

const inside = (parent: string, child: string): boolean => {
  const rel = relative(parent, child);

  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
};

/**
 * Deletes `<memoryDir>/<slug>` and `<worktreesDir>/<slug>`. Returns the paths that could not
 * be removed (empty when everything is gone); never throws.
 */
export async function removeProjectFiles(
  dataHome: Pick<DataHomeLayout, 'memoryDir' | 'worktreesDir'>,
  slug: string,
): Promise<string[]> {
  const targets = [
    [dataHome.memoryDir, join(dataHome.memoryDir, slug)],
    [dataHome.worktreesDir, join(dataHome.worktreesDir, slug)],
  ] as const;

  const left: string[] = [];
  for (const [parent, path] of targets) {
    if (!inside(parent, path)) {
      left.push(path);

      continue;
    }

    try {
      await rm(path, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 });
    } catch {
      left.push(path);
    }
  }

  return left;
}
