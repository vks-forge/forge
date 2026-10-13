/**
 * Unified patch parser.
 *
 * Why: the test-diff gate and the `added_test` claim need to know which lines were added
 *   or removed in which file, and `WorktreeDiff` carries that only as raw patch text.
 *   Parsing it here once keeps git's output format out of every check.
 *
 * Exports: parsePatch().
 * Depends on: types/check.types. No IO.
 */

import type { PatchDraft, PatchFile } from '#/types/check.types.js';

const HEADER = /^diff --git a\/(.+?) b\/(.+)$/;

/** Splits a `git diff` patch into per-file added and removed lines (marker stripped). */
export function parsePatch(patch: string): PatchFile[] {
  const files: PatchDraft[] = [];
  let current: PatchDraft | null = null;
  let inHunk = false;
  for (const line of patch.split(/\r?\n/)) {
    const header = HEADER.exec(line);
    if (header) {
      current = { path: header[2] as string, deleted: false, added: [], removed: [] };
      files.push(current);
      inHunk = false;
      continue;
    }

    if (!current) {
      continue;
    }

    if (line.startsWith('@@')) {
      inHunk = true;
    } else if (!inHunk && line.startsWith('deleted file mode')) {
      current.deleted = true;
    } else if (inHunk && line.startsWith('+')) {
      current.added.push(line.slice(1));
    } else if (inHunk && line.startsWith('-')) {
      current.removed.push(line.slice(1));
    }
  }

  return files;
}
