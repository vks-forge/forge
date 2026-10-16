/**
 * Looks at a folder with git: its own repository, no repository, or inside someone else's.
 *
 * Why: any folder can be a project (d-0124), so onboarding must know where the folder
 *   stands before it offers choices: a repository is used as it is, a folder with no git
 *   needs a local repository started, and a folder inside a larger repository needs the
 *   user to pick the repository top or just the subfolder. It also reports what the
 *   next steps depend on: whether there is a commit to branch from, whether tracked files
 *   have uncommitted changes (a local merge into a dirty checked-out branch must wait for
 *   the user), and the remote, so GitHub projects can use the App connection. Read only:
 *   nothing is created, fetched or written.
 *
 * Exports: inspectFolderGit().
 * Depends on: node:fs, node:path, @forge/core (GitInspection), adapters/git-cli/run-git,
 *   domain/{porcelain,remote-url}, shared/canonical-path. IO: runs git, stats the folder.
 */

import { statSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import type { GitInspection } from '@forge/core';
import { createGitRunner } from '#/adapters/git-cli/run-git.js';
import { normalizePath, samePath } from '#/domain/porcelain.js';
import { githubRepoOf } from '#/domain/remote-url.js';
import { canonicalPath } from '#/shared/canonical-path.js';
import type { FolderGitOptions } from '#/types/folder-git.types.js';

const NONE: GitInspection = {
  state: 'none',
  repo_root: null,
  subfolder: null,
  has_commits: false,
  dirty: false,
  remote: null,
};

/** Git state of `opts.path`; the folder must exist (the caller checks that first). */
export async function inspectFolderGit(opts: FolderGitOptions): Promise<GitInspection> {
  const git = createGitRunner(opts.gitBinary ?? 'git');
  const path = resolve(opts.path);
  if (!statSync(path).isDirectory()) {
    return NONE;
  }

  const top = await git.try(path, ['rev-parse', '--show-toplevel']);
  if (top.code !== 0 || top.stdout.trim() === '') {
    return NONE;
  }

  const root = normalizePath(top.stdout.trim());
  const here = normalizePath(canonicalPath(path));
  const atTop = samePath(normalizePath(canonicalPath(root)), here);
  const sub = atTop
    ? null
    : normalizePath(relative(canonicalPath(root), canonicalPath(path)));

  const head = await git.try(root, ['rev-parse', '--verify', '--quiet', 'HEAD']);
  const status = await git.try(root, ['status', '--porcelain', '--untracked-files=no']);

  return {
    state: atTop ? 'repo' : 'inside_repo',
    repo_root: root,
    subfolder: sub === '' ? null : sub,
    has_commits: head.code === 0,
    dirty: status.code === 0 && status.stdout.trim() !== '',
    remote: await remoteOf(git, root),
  };
}

/** `origin`, else the first remote, with its fetch URL; null when there is none. */
async function remoteOf(
  git: ReturnType<typeof createGitRunner>,
  root: string,
): Promise<GitInspection['remote']> {
  const list = await git.try(root, ['remote']);
  const names = list.stdout
    .split('\n')
    .map((n) => n.trim())
    .filter((n) => n !== '');

  const name = names.includes('origin') ? 'origin' : names[0];
  if (name === undefined) {
    return null;
  }

  const url = (await git.try(root, ['remote', 'get-url', name])).stdout.trim();
  if (url === '') {
    return null;
  }

  return { name, url, github: githubRepoOf(url) };
}
