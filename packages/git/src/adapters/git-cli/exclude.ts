/**
 * Keeps `.worktrees/` out of the main checkout's `git status`.
 *
 * Why: worktrees live inside the main checkout's directory (d-0059). Without an ignore
 *   rule git lists them as untracked, the Director sees a dirty main tree, and a careless
 *   `git add -A` there would try to add other tickets' trees. `info/exclude` is local and
 *   never committed, so it needs no change to the user's `.gitignore` (d-0039).
 *
 * Exports: ensureWorktreesExcluded().
 * Depends on: node:fs, node:path, types/git-worktree. IO: reads/appends one git file.
 */

import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { GitRunner } from '#/types/git-worktree.types.js';

const RULE = '/.worktrees/';

/** Appends `/.worktrees/` to `<git-common-dir>/info/exclude` unless a line already says so. */
export async function ensureWorktreesExcluded(
  git: GitRunner,
  repoRoot: string,
): Promise<void> {
  const common = (await git.run(repoRoot, ['rev-parse', '--git-common-dir'])).trim();
  const file = resolve(repoRoot, common, 'info', 'exclude');
  let current = '';
  try {
    current = await readFile(file, 'utf8');
  } catch {
    // Missing file is the normal case on a fresh repo; it is created below.
  }
  if (current.split(/\r?\n/).some((l) => l.trim() === RULE || l.trim() === '.worktrees/'))
    return;
  await mkdir(dirname(file), { recursive: true });
  const sep = current.length === 0 || current.endsWith('\n') ? '' : '\n';
  await appendFile(file, `${sep}${RULE}\n`);
}
