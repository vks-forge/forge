/**
 * Git-CLI implementation of the WorktreeManager port.
 *
 * Why: every Worker run gets its own git worktree on its own branch so tickets run in
 *   parallel and the main checkout (and Forge's runtime data) stays outside the Worker's
 *   cwd (d-0059). The Director also needs the truth about what a run changed and a
 *   Forge-authored commit for the PR. This adapter does it with the plain `git` binary:
 *   args arrays only, no shell, repo hooks disabled for commits made in a Worker-controlled
 *   tree, and `create` safe to call again after a crash. Paths it returns are absolute with
 *   forward slashes (`C:/data/worktrees/proj/FRG-1`), which Node and git both accept on Windows.
 *
 *   A project scoped to a subfolder of a repository (d-0124) gets worktrees of the whole
 *   repository, but the path handed out (the Worker's cwd, and the folder gates and checks
 *   run in) is the subfolder inside it. Every method takes that path or the worktree root.
 *   Changed paths are reported relative to the subfolder, so Worker claims, receipts and
 *   diff agree; a change outside the subfolder shows as `../x`, which G1 refuses.
 *
 * Exports: createGitWorktreeManager().
 * Depends on: node:fs, node:os, node:path, @forge/core, adapters/git-cli/{run-git,resolve-base},
 *   domain/{name-status,porcelain,ref-check}. IO: runs git, stats paths.
 */

import { existsSync } from 'node:fs';
import { devNull } from 'node:os';
import { posix, resolve } from 'node:path';
import { CrashError, InvalidInputError } from '@forge/core';
import type { Worktree, WorktreeDiffFile, WorktreeManager } from '@forge/core';
import { resolveBaseCommit } from '#/adapters/git-cli/resolve-base.js';
import { createGitRunner } from '#/adapters/git-cli/run-git.js';
import { parseNameStatus } from '#/domain/name-status.js';
import { normalizePath, parseWorktreeList, samePath } from '#/domain/porcelain.js';
import { canonicalPath } from '#/shared/canonical-path.js';
import { assertSafeRefArg } from '#/domain/ref-check.js';
import type { GitWorktreeManagerOptions } from '#/types/git-worktree.types.js';

const DEFAULT_AUTHOR = { name: 'Forge', email: 'forge@localhost' } as const;

/**
 * Prefix for every diff invocation: `core.quotePath=false` keeps non-ASCII names readable in
 * patch headers; `--text` (added per call) stops a Worker-written `.gitattributes -diff`
 * from replacing hunks with "Binary files differ", which would hide a disabled test.
 */
const DIFF_CONFIG = ['-c', 'core.quotePath=false'] as const;

const names = (out: string): string[] => out.split('\0').filter((n) => n.length > 0);

/** Creates a WorktreeManager that shells out to the `git` binary (no shell string, ever). */
export function createGitWorktreeManager(
  opts: GitWorktreeManagerOptions,
): WorktreeManager {
  const git = createGitRunner(opts.gitBinary ?? 'git');
  const author = opts.author ?? DEFAULT_AUTHOR;
  const repoRoot = normalizePath(resolve(opts.repoRoot));
  const worktreeRoot = resolve(opts.worktreeRoot);
  const sub = (opts.subfolder ?? '').replaceAll('\\', '/').replace(/^\/+|\/+$/g, '');

  /** The worktree root for a path that is the root itself or the scoped folder inside it. */
  const rootOf = (path: string): string => {
    const p = normalizePath(path);
    const tail = `/${sub}`;

    return sub !== '' && p.toLowerCase().endsWith(tail.toLowerCase())
      ? p.slice(0, p.length - tail.length)
      : p;
  };

  const scoped = (root: string): string => (sub === '' ? root : `${root}/${sub}`);

  /** A repository-relative path in the frame of the scoped folder (`../x` when outside it). */
  const inScopeFrame = (p: string): string =>
    sub === ''
      ? p
      : p.startsWith(`${sub}/`)
        ? p.slice(sub.length + 1)
        : posix.relative(sub, p);

  const relativeFlag = sub === '' ? [] : [`--relative=${sub}`];

  /** The scoped folder, once it is known to exist in the new worktree. */
  const scopeExists = (dir: string): string => {
    if (!existsSync(dir)) {
      throw new InvalidInputError(
        `the project folder ${sub} does not exist on the base branch`,
      );
    }

    return dir;
  };

  const list = async () =>
    parseWorktreeList(await git.run(repoRoot, ['worktree', 'list', '--porcelain']));

  const mergeBase = async (baseRef: string, branch: string) =>
    (await git.run(repoRoot, ['merge-base', baseRef, branch])).trim();

  return {
    async create(ticketId, branch, baseRef): Promise<Worktree> {
      assertSafeRefArg('baseRef', baseRef);
      assertSafeRefArg('branch', branch);
      const fmt = await git.try(repoRoot, ['check-ref-format', '--branch', branch]);
      if (fmt.code !== 0) {
        throw new InvalidInputError(`invalid branch name: ${branch}`);
      }

      const path = normalizePath(resolve(worktreeRoot, ticketId));
      const trees = await list();

      const here = trees.find((t) =>
        samePath(canonicalPath(t.path), canonicalPath(path)),
      );

      if (here) {
        if (here.branch !== branch) {
          const on = here.branch ?? 'a detached head';
          throw new InvalidInputError(
            `${path} is already a worktree on ${on}, not ${branch}`,
          );
        }

        return { path: scoped(path), baseSha: await mergeBase(baseRef, branch) };
      }

      if (trees.some((t) => t.branch === branch)) {
        throw new InvalidInputError(
          `branch ${branch} is already checked out in another worktree`,
        );
      }

      if (existsSync(path)) {
        throw new InvalidInputError(`${path} exists but is not a git worktree`);
      }

      const ref = ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`];
      if ((await git.try(repoRoot, ref)).code === 0) {
        // Branch kept from an earlier removed worktree: re-attach it instead of failing on -b.
        await git.run(repoRoot, ['worktree', 'add', path, branch]);

        return {
          path: scopeExists(scoped(path)),
          baseSha: await mergeBase(baseRef, branch),
        };
      }

      const baseSha = await resolveBaseCommit(git, repoRoot, baseRef);

      await git.run(repoRoot, ['worktree', 'add', '-b', branch, path, baseRef]);

      return { path: scopeExists(scoped(path)), baseSha };
    },

    async remove(path) {
      const target = rootOf(path);
      const r = await git.try(repoRoot, ['worktree', 'remove', '--force', target]);
      // Already-gone is fine; a directory that survives a failed remove is a real error.
      if (r.code !== 0 && existsSync(target)) {
        await git.run(repoRoot, ['worktree', 'remove', '--force', target]);
      }

      await git.run(repoRoot, ['worktree', 'prune']);
    },

    async changedFiles(path, baseSha) {
      assertSafeRefArg('baseSha', baseSha);
      const root = rootOf(path);
      const [tracked, untracked] = await Promise.all([
        git.run(root, [
          ...DIFF_CONFIG,
          'diff',
          '--name-only',
          '--no-renames',
          '-z',
          baseSha,
          '--',
        ]),
        git.run(root, ['ls-files', '--others', '--exclude-standard', '-z']),
      ]);

      return [
        ...new Set([...names(tracked), ...names(untracked)].map(inScopeFrame)),
      ].sort();
    },

    async diff(path, baseSha) {
      assertSafeRefArg('baseSha', baseSha);
      const root = rootOf(path);
      const cwd = scoped(root);
      // Tracked changes (committed, staged and unstaged) against the base, renames detected.
      // Status is repository-wide so out-of-scope edits are seen; the patch is scoped.
      const [status, tracked, untrackedOut] = await Promise.all([
        git.run(root, [
          ...DIFF_CONFIG,
          'diff',
          '--name-status',
          '-M',
          '-z',
          baseSha,
          '--',
        ]),
        git.run(root, [
          ...DIFF_CONFIG,
          'diff',
          '--text',
          '--no-color',
          '--no-ext-diff',
          '-M',
          ...relativeFlag,
          baseSha,
          '--',
        ]),
        git.run(root, ['ls-files', '--others', '--exclude-standard', '-z']),
      ]);

      const files: WorktreeDiffFile[] = parseNameStatus(status).map((f) => ({
        ...f,
        path: inScopeFrame(f.path),
        ...(f.oldPath === undefined ? {} : { oldPath: inScopeFrame(f.oldPath) }),
      }));

      const patches = [tracked];
      // Untracked files are in no index: show each as an added file without touching the tree.
      for (const rootName of names(untrackedOut).sort()) {
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

      files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

      return { files, patch: patches.join('') };
    },

    async commitAll(path, message) {
      const root = rootOf(path);
      await git.run(root, ['add', '-A']);
      const staged = await git.try(root, ['diff', '--cached', '--quiet']);
      if (staged.code === 0) {
        return null;
      }

      const identity = [
        ...['-c', `user.name=${author.name}`],
        ...['-c', `user.email=${author.email}`],
        ...['-c', 'commit.gpgsign=false'],
        // The tree is Worker-controlled: never run its hooks inside Forge's process.
        ...['-c', `core.hooksPath=${devNull}`],
      ];

      await git.run(root, [...identity, 'commit', '--no-verify', '-m', message], {
        env: {
          GIT_AUTHOR_NAME: author.name,
          GIT_AUTHOR_EMAIL: author.email,
          GIT_COMMITTER_NAME: author.name,
          GIT_COMMITTER_EMAIL: author.email,
        },
      });

      return (await git.run(root, ['rev-parse', 'HEAD'])).trim();
    },

    async head(path) {
      return (await git.run(rootOf(path), ['rev-parse', 'HEAD'])).trim();
    },
  };
}
