/**
 * Untracked files as "added" entries of a diff.
 *
 * Why: files a Worker created are in no index, so `git diff` against the base never shows them,
 *   yet the gates must judge them like any other change. Each one is shown as an added file
 *   with its patch, without touching the tree (`--no-index` against /dev/null). Files outside
 *   the project's folder are listed but get no patch, because the patch is scoped to the folder.
 *
 * Exports: untrackedAsAdded().
 * Depends on: @forge/core (CrashError, WorktreeDiffFile), types/git-worktree. IO: runs git.
 */

import { CrashError } from '@forge/core';
import type { WorktreeDiffFile } from '@forge/core';
import type { GitRunner } from '#/types/git-worktree.types.js';

/** `-c core.quotePath=false` keeps non-ASCII names readable; `--text` stops `.gitattributes -diff` hiding hunks. */
const DIFF_CONFIG = ['-c', 'core.quotePath=false'] as const;

/** The added entries and patch texts for repository-relative `rootNames`, run from the scoped folder `cwd`. */
export async function untrackedAsAdded(
  git: GitRunner,
  cwd: string,
  rootNames: readonly string[],
  inScopeFrame: (path: string) => string,
): Promise<{ files: WorktreeDiffFile[]; patches: string[] }> {
  const files: WorktreeDiffFile[] = [];
  const patches: string[] = [];
  for (const rootName of [...rootNames].sort()) {
    const name = inScopeFrame(rootName);
    files.push({ status: 'A', path: name });
    if (name.startsWith('../')) {
      continue;
    }

    // --no-index exits 1 when the files differ, which is the expected case here.
    const r = await git.try(cwd, [
      ...DIFF_CONFIG,
      'diff',
      '--text',
      '--no-index',
      '--no-color',
      '--no-ext-diff',
      '--',
      '/dev/null',
      name,
    ]);

    if (r.code > 1) {
      throw new CrashError(`git diff failed for ${name}: ${r.stderr.trim()}`);
    }

    patches.push(r.stdout);
  }

  return { files, patches };
}
