/**
 * Starts a local git repository in a folder that has none, optionally with a snapshot commit.
 *
 * Why: Forge needs git to cut worktrees, diff and merge, but a user's folder may have
 *   none (d-0124). The user chooses between a snapshot commit of the existing files (the
 *   Worker then branches from what they have) and init only (an empty repository: work waits
 *   for the user's first commit). Safety rules live here, in one place: never start a
 *   repository inside another one (no nested init), refuse a snapshot above the size guard
 *   before anything is written, add the standard `.gitignore` only when the folder has none,
 *   give the snapshot commit Forge's identity with `-c` flags so the user's global git
 *   config is never written, never run the folder's hooks, and when the commit fails undo
 *   what this call created (`.git`, and `.gitignore` if Forge wrote it).
 *
 * Exports: initLocalRepo().
 * Depends on: node:fs, node:os, node:path, @forge/core (InvalidInputError), adapters/git-cli/{run-git,snapshot-scan},
 *   shared/snapshot-errors. IO: runs git, writes `.git` and maybe `.gitignore` in the folder.
 */

import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { devNull } from 'node:os';
import { join, resolve } from 'node:path';
import { InvalidInputError } from '@forge/core';
import { createGitRunner } from '#/adapters/git-cli/run-git.js';
import { scanSnapshot, STANDARD_GITIGNORE } from '#/adapters/git-cli/snapshot-scan.js';
import { assertSafeRefArg } from '#/domain/ref-check.js';
import { SnapshotTooLargeError } from '#/shared/snapshot-errors.js';
import type {
  InitLocalRepoOptions,
  InitLocalRepoResult,
} from '#/types/folder-git.types.js';

const DEFAULT_AUTHOR = { name: 'Forge', email: 'forge@localhost' } as const;
const SNAPSHOT_MESSAGE = 'Initial snapshot (Forge)';

export async function initLocalRepo(
  opts: InitLocalRepoOptions,
): Promise<InitLocalRepoResult> {
  const git = createGitRunner(opts.gitBinary ?? 'git');
  const path = resolve(opts.path);
  const author = opts.author ?? DEFAULT_AUTHOR;
  assertSafeRefArg('branch', opts.branch);

  if ((await git.try(path, ['check-ref-format', '--branch', opts.branch])).code !== 0) {
    throw new InvalidInputError(`invalid branch name: ${opts.branch}`);
  }

  // Never nested: a folder anywhere inside a repository is that repository's business.
  if ((await git.try(path, ['rev-parse', '--show-toplevel'])).code === 0) {
    throw new InvalidInputError(`${path} is already inside a git repository`);
  }

  if (opts.mode === 'snapshot') {
    const scan = await scanSnapshot({
      path,
      ...(opts.limits ? { limits: opts.limits } : {}),
      ...(opts.gitBinary ? { gitBinary: opts.gitBinary } : {}),
    });

    if (scan.truncated) {
      throw new SnapshotTooLargeError(scan.files, scan.bytes);
    }
  }

  const gitignore = join(path, '.gitignore');
  const wroteGitignore = opts.mode === 'snapshot' && !existsSync(gitignore);

  try {
    await git.run(path, ['init', '--quiet']);
    // Works before the first commit on every git version, unlike `init -b`.
    await git.run(path, ['symbolic-ref', 'HEAD', `refs/heads/${opts.branch}`]);
    if (opts.mode === 'init_only') {
      return { commit: null, wroteGitignore: false };
    }

    if (wroteGitignore) {
      writeFileSync(gitignore, STANDARD_GITIGNORE);
    }

    const identity = [
      ...['-c', `user.name=${author.name}`],
      ...['-c', `user.email=${author.email}`],
      ...['-c', 'commit.gpgsign=false'],
      ...['-c', `core.hooksPath=${devNull}`],
    ];

    await git.run(path, [...identity, 'add', '-A']);
    await git.run(path, [
      ...identity,
      'commit',
      '--allow-empty',
      '--no-verify',
      '-m',
      SNAPSHOT_MESSAGE,
    ]);

    return {
      commit: (await git.run(path, ['rev-parse', 'HEAD'])).trim(),
      wroteGitignore,
    };
  } catch (error) {
    // Only what this call made: the folder had no repository when it started.
    rmSync(join(path, '.git'), { recursive: true, force: true });
    if (wroteGitignore) {
      rmSync(gitignore, { force: true });
    }

    throw error;
  }
}
