/**
 * Check that a folder is a usable local clone before a project is registered on it.
 *
 * Why: a project is "a git clone on this machine plus a base branch" (d-0083). If a folder
 *   that is not a repository, a subfolder of one, or a clone without the base branch were
 *   accepted, the first ticket would fail deep inside worktree creation with a git error
 *   the user cannot connect to the form they filled in. Checking at registration turns
 *   that into one plain message naming the folder or the branch. The check only reads: it
 *   never fetches, checks out or writes into the user's clone.
 *
 * Exports: inspectRepository().
 * Depends on: node:fs, node:path, adapters/git-cli/run-git, domain/porcelain, domain/ref-check.
 *   IO: stats the path, runs git.
 */

import { statSync } from 'node:fs';
import { resolve } from 'node:path';
import { createGitRunner } from '#/adapters/git-cli/run-git.js';
import { normalizePath, samePath } from '#/domain/porcelain.js';
import { assertSafeRefArg } from '#/domain/ref-check.js';
import type {
  RepositoryInspection,
  RepositoryInspectionOptions,
} from '#/types/inspect-repository.types.js';

/** Looks at `path` and `baseBranch` without changing anything; never throws for a bad folder, only reports it. */
export async function inspectRepository(
  opts: RepositoryInspectionOptions,
): Promise<RepositoryInspection> {
  const git = createGitRunner(opts.gitBinary ?? 'git');
  const path = resolve(opts.path);

  let isDirectory = false;
  try {
    isDirectory = statSync(path).isDirectory();
  } catch {
    isDirectory = false;
  }

  if (!isDirectory) {
    return { ok: false, code: 'not_a_directory', message: `${path} is not a folder` };
  }

  const top = await git.try(path, ['rev-parse', '--show-toplevel']);
  if (top.code !== 0) {
    return {
      ok: false,
      code: 'not_a_repository',
      message: `${path} is not a git repository`,
    };
  }

  // A subfolder would work for git but is almost certainly not the clone the user meant.
  if (!samePath(normalizePath(top.stdout.trim()), normalizePath(path))) {
    return {
      ok: false,
      code: 'not_repository_root',
      message: `${path} is inside a repository whose root is ${top.stdout.trim()}; choose the root folder`,
    };
  }

  assertSafeRefArg('baseBranch', opts.baseBranch);
  const base = await git.try(path, [
    'rev-parse',
    '--verify',
    '--quiet',
    `${opts.baseBranch}^{commit}`,
  ]);

  if (base.code !== 0) {
    return {
      ok: false,
      code: 'base_branch_missing',
      message: `branch ${opts.baseBranch} does not exist in ${path}`,
    };
  }

  return { ok: true, baseSha: base.stdout.trim() };
}
