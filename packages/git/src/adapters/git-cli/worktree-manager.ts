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
 *   Setup (d-0180) installs dependencies into the tree first; what it created is recorded and
 *   kept out of changed files, the diff and commits, so an install never reads as Worker work.
 *
 * Exports: createGitWorktreeManager() (mergeIn and contains come from merge-in.ts).
 * Depends on: node:fs, node:path, @forge/core, adapters/git-cli/{run-git,resolve-base,
 *   worktree-prep-store,remove-worktree,scope-frame,untracked-diff,commit-identity,merge-in}, domain/{name-status,porcelain,ref-check}. IO: runs git, stats paths.
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { InvalidInputError } from '@forge/core';
import type { Worktree, WorktreeDiffFile, WorktreeManager } from '@forge/core';
import { commitConfig, commitEnv } from '#/adapters/git-cli/commit-identity.js';
import { createMergeIn } from '#/adapters/git-cli/merge-in.js';
import { resolveBaseCommit } from '#/adapters/git-cli/resolve-base.js';
import {
  deleteLocalBranch,
  removeWorktreeFolder,
} from '#/adapters/git-cli/remove-worktree.js';
import { createGitRunner } from '#/adapters/git-cli/run-git.js';
import { untrackedAsAdded } from '#/adapters/git-cli/untracked-diff.js';
import { createScopeFrame } from '#/adapters/git-cli/scope-frame.js';
import {
  createPrepStore,
  excludePathspecs,
} from '#/adapters/git-cli/worktree-prep-store.js';
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

const LONG_PATHS = ['-c', 'core.longpaths=true'] as const;

const names = (out: string): string[] => out.split('\0').filter((n) => n.length > 0);

/** Creates a WorktreeManager that shells out to the `git` binary (no shell string, ever). */
export function createGitWorktreeManager(
  opts: GitWorktreeManagerOptions,
): WorktreeManager {
  const git = createGitRunner(opts.gitBinary ?? 'git');
  const author = opts.author ?? DEFAULT_AUTHOR;
  const repoRoot = normalizePath(resolve(opts.repoRoot));
  const worktreeRoot = resolve(opts.worktreeRoot);
  const prepStore = createPrepStore(worktreeRoot);
  const sub = (opts.subfolder ?? '').replaceAll('\\', '/').replace(/^\/+|\/+$/g, '');

  const { rootOf, scoped, inScopeFrame } = createScopeFrame(sub);
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

  const outputsOf = async (root: string): Promise<string[]> =>
    (await prepStore.read(root))?.outputs ?? [];

  /** Untracked, not-ignored files (`-z`) minus what setup created. */
  const untrackedFiles = async (root: string): Promise<string> =>
    git.run(root, [
      'ls-files',
      '--others',
      '--exclude-standard',
      '-z',
      '--',
      '.',
      ...excludePathspecs(await outputsOf(root)),
    ]);

  const mergeBase = async (baseRef: string, branch: string) =>
    (await git.run(repoRoot, ['merge-base', baseRef, branch])).trim();

  const merging = createMergeIn({
    git,
    author,
    rootOf,
    inScopeFrame,
    excludes: async (root) => excludePathspecs(await outputsOf(root)),
  });

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
        await git.run(repoRoot, [...LONG_PATHS, 'worktree', 'add', path, branch]);

        return {
          path: scopeExists(scoped(path)),
          baseSha: await mergeBase(baseRef, branch),
        };
      }

      const baseSha = await resolveBaseCommit(git, repoRoot, baseRef);

      await git.run(repoRoot, [
        ...LONG_PATHS,
        'worktree',
        'add',
        '-b',
        branch,
        path,
        baseRef,
      ]);

      return { path: scopeExists(scoped(path)), baseSha };
    },

    async remove(path, removeOpts) {
      const target = rootOf(path);
      if (removeOpts?.deleteBranch !== undefined) {
        assertSafeRefArg('deleteBranch', removeOpts.deleteBranch);
      }

      await removeWorktreeFolder(git, repoRoot, target);
      await prepStore.remove(target);
      if (removeOpts?.deleteBranch !== undefined) {
        await deleteLocalBranch(git, repoRoot, removeOpts.deleteBranch);
      }
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
        untrackedFiles(root),
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
        untrackedFiles(root),
      ]);

      const files: WorktreeDiffFile[] = parseNameStatus(status).map((f) => ({
        ...f,
        path: inScopeFrame(f.path),
        ...(f.oldPath === undefined ? {} : { oldPath: inScopeFrame(f.oldPath) }),
      }));

      const added = await untrackedAsAdded(git, cwd, names(untrackedOut), inScopeFrame);
      files.push(...added.files);

      files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

      return { files, patch: [tracked, ...added.patches].join('') };
    },

    async commitAll(path, message) {
      const root = rootOf(path);
      const skip = excludePathspecs(await outputsOf(root));
      await git.run(root, ['add', '-A', '--', '.', ...skip]);
      const staged = await git.try(root, ['diff', '--cached', '--quiet']);
      if (staged.code === 0) {
        return null;
      }

      await git.run(
        root,
        [...commitConfig(author), 'commit', '--no-verify', '-m', message],
        { env: commitEnv(author) },
      );

      return (await git.run(root, ['rev-parse', 'HEAD'])).trim();
    },

    async head(path) {
      return (await git.run(rootOf(path), ['rev-parse', 'HEAD'])).trim();
    },

    rootOf,

    async untracked(path) {
      const out = await git.run(rootOf(path), [
        'ls-files',
        '--others',
        '--exclude-standard',
        '--directory',
        '-z',
      ]);

      return names(out).map((n) => n.replace(/\/+$/, ''));
    },

    readPrep: (path) => prepStore.read(rootOf(path)),

    writePrep: (path, prep) => prepStore.write(rootOf(path), prep),

    ...merging,
  };
}
