/**
 * Merge a base commit into a ticket's branch, inside its worktree.
 *
 * Why: while a ticket is in flight the base branch moves (another ticket merged first). Left
 *   alone, the ticket's PR turns unmergeable and nothing can fix it. Forge instead merges the
 *   new base into the branch: no rewritten history (a rebase would force a push, which Forge
 *   never does, d-0012), the PR updates by a normal push, and the base tip becomes an ancestor
 *   so the diff against the merge-base still shows only this ticket's change. A clean merge is
 *   committed as Forge. A conflict is committed too, markers and all, so the state survives a
 *   restart and the Worker that resolves it sees the same tree: text files keep their
 *   `<<<<<<<` markers, binary files and delete-versus-modify keep the ticket's side (nothing
 *   to hand-edit), and the commits the base gained on those files come back so the resolver
 *   knows what the other ticket meant. A merge that cannot start at all (a dirty tree git
 *   refuses to overwrite) is a typed crash, never read as "up to date".
 *
 * Exports: createMergeIn().
 * Depends on: @forge/core (CrashError), adapters/git-cli/commit-identity, domain/{ref-check,unmerged},
 *   types/merge-in. IO: runs git in the worktree.
 */

import { CrashError } from '@forge/core';
import type { ConflictFile, UpstreamCommit } from '@forge/core';
import { commitConfig, commitEnv } from '#/adapters/git-cli/commit-identity.js';
import { assertSafeRefArg } from '#/domain/ref-check.js';
import { looksBinary, parseUnmerged } from '#/domain/unmerged.js';
import type { MergeInDeps, MergeInOps } from '#/types/merge-in.types.js';

const MAX_UPSTREAM = 20;
const MAX_PATHSPECS = 200;
const STDERR_TAIL = 600;

/** The `mergeIn` and `contains` operations of a worktree manager. */
export function createMergeIn(deps: MergeInDeps): MergeInOps {
  const { git, author } = deps;
  const head = async (root: string): Promise<string> =>
    (await git.run(root, ['rev-parse', 'HEAD'])).trim();

  const contains = async (path: string, sha: string): Promise<boolean> => {
    assertSafeRefArg('sha', sha);
    const r = await git.try(deps.rootOf(path), [
      'merge-base',
      '--is-ancestor',
      sha,
      'HEAD',
    ]);

    if (r.code === 0 || r.code === 1) {
      return r.code === 0;
    }

    throw new CrashError(
      `git merge-base failed (exit ${r.code}): ${r.stderr.trim().slice(-STDERR_TAIL)}`,
    );
  };

  /** Resolves each unmerged path to the ticket's side and reports it; text conflicts stay marked. */
  const settle = async (
    root: string,
  ): Promise<{ files: ConflictFile[]; paths: string[] }> => {
    const unmerged = parseUnmerged(await git.run(root, ['ls-files', '-u', '-z']));
    const files: ConflictFile[] = [];

    for (const [path, stages] of unmerged) {
      const ticket = stages.get(2);
      const base = stages.get(3);
      const blob = ticket ?? base;
      const binary =
        blob !== undefined &&
        looksBinary(await git.run(root, ['cat-file', 'blob', blob]));

      const file = { path: deps.inScopeFrame(path), binary };
      if (ticket === undefined) {
        // The ticket deleted it, the base changed it: stay deleted.
        await git.run(root, ['rm', '-f', '-q', '--', path]);
        files.push({ ...file, deletedBy: 'ticket' });
      } else if (base === undefined) {
        // The base deleted it, the ticket changed it: keep the ticket's file.
        await git.run(root, ['add', '--', path]);
        files.push({ ...file, deletedBy: 'base' });
      } else if (binary) {
        await git.run(root, ['checkout', '--ours', '--', path]);
        await git.run(root, ['add', '--', path]);
        files.push(file);
      } else {
        files.push(file);
      }
    }

    return { files, paths: [...unmerged.keys()] };
  };

  /** Commits the base gained on `paths` that the branch did not have before the merge. */
  const upstreamOf = async (
    root: string,
    before: string,
    sha: string,
    paths: readonly string[],
  ): Promise<UpstreamCommit[]> => {
    const out = await git.run(root, [
      'log',
      '--no-merges',
      `--max-count=${MAX_UPSTREAM}`,
      '--format=%H%x00%s',
      `${before}..${sha}`,
      '--',
      ...paths.slice(0, MAX_PATHSPECS),
    ]);

    return out
      .split('\n')
      .filter((line) => line.length > 0)
      .map((line) => {
        const [commit = '', subject = ''] = line.split('\0');

        return { sha: commit, subject };
      });
  };

  return {
    contains,

    async mergeIn(path, sha, message) {
      assertSafeRefArg('sha', sha);
      const root = deps.rootOf(path);
      if (await contains(path, sha)) {
        return { kind: 'up_to_date' };
      }

      const before = await head(root);
      const env = commitEnv(author);
      const merged = await git.try(
        root,
        [
          ...commitConfig(author),
          ...['-c', 'merge.conflictStyle=merge'],
          ...['merge', '--no-verify', '--no-gpg-sign', '--no-edit', '-m', message, sha],
        ],
        { env },
      );

      if (merged.code === 0) {
        return { kind: 'merged', head: await head(root) };
      }

      const { files, paths } = await settle(root);
      if (files.length === 0) {
        // Git refused before touching anything (e.g. uncommitted changes in the way).
        const why = (merged.stderr || merged.stdout).trim().slice(-STDERR_TAIL);
        throw new CrashError(`git merge failed (exit ${merged.code}): ${why}`);
      }

      const skip = await deps.excludes(root);
      await git.run(root, ['add', '-A', '--', '.', ...skip]);
      await git.run(
        root,
        [
          ...commitConfig(author),
          'commit',
          '--no-verify',
          '--no-gpg-sign',
          '-m',
          message,
        ],
        { env },
      );

      return {
        kind: 'conflict',
        head: await head(root),
        files,
        upstream: await upstreamOf(root, before, sha, paths),
      };
    },
  };
}
