/**
 * Worktree removal that survives a locked or oversized tree.
 *
 * Why: a ticket's worktree holds an install folder (`node_modules`, `.venv`) with thousands of
 *   files, long paths and read-only entries. On Windows `git worktree remove` fails on those or
 *   on a file an editor or antivirus still holds, and a failure that is only logged leaves a
 *   leftover folder per cancelled ticket. This removes through git first, then deletes the
 *   folder itself with retries, prunes git's record, and only reports an error when the folder
 *   is still there. A cancelled ticket's local branch can be deleted in the same call.
 *
 * Exports: removeWorktreeFolder(), deleteLocalBranch().
 * Depends on: node:fs, node:fs/promises, @forge/core (CrashError), adapters/git-cli/run-git types. IO: runs git, deletes a folder.
 */

import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { CrashError } from '@forge/core';
import { assertSafeRefArg } from '#/domain/ref-check.js';
import type { GitRunner } from '#/types/git-worktree.types.js';

const LONG_PATHS = ['-c', 'core.longpaths=true'] as const;
const RM_RETRIES = 5;
const RM_DELAY_MS = 200;

/** Removes the worktree folder and git's record of it; an already-gone folder is fine. */
export async function removeWorktreeFolder(
  git: GitRunner,
  repoRoot: string,
  target: string,
): Promise<void> {
  const r = await git.try(repoRoot, [
    ...LONG_PATHS,
    'worktree',
    'remove',
    '--force',
    target,
  ]);

  if (r.code !== 0 && existsSync(target)) {
    try {
      await rm(target, {
        recursive: true,
        force: true,
        maxRetries: RM_RETRIES,
        retryDelay: RM_DELAY_MS,
      });
    } catch (cause) {
      throw new CrashError(`could not remove ${target}: ${String(cause)}`, { cause });
    }
  }

  await git.run(repoRoot, ['worktree', 'prune']);
  if (existsSync(target)) {
    throw new CrashError(`${target} is still there after removal`);
  }
}

/** Deletes a local branch that exists; a missing branch is fine, a checked-out one throws. */
export async function deleteLocalBranch(
  git: GitRunner,
  repoRoot: string,
  branch: string,
): Promise<void> {
  assertSafeRefArg('deleteBranch', branch);
  const ref = ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`];
  if ((await git.try(repoRoot, ref)).code !== 0) {
    return;
  }

  await git.run(repoRoot, ['branch', '-D', branch]);
}
