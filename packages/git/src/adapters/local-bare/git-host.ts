/**
 * Local bare-repo implementation of the GitHost port.
 *
 * Why: the end-to-end fixture and any offline run need the whole push, open-PR, verify,
 *   merge flow without a network or a GitHub App. A bare repository on disk plays the
 *   remote and one JSON record per PR plays the pull request, so the engine exercises
 *   exactly the code path it uses against GitHub. Merging is done with git plumbing inside
 *   the bare repo (`merge-tree` computes the merged tree, `commit-tree` writes the commit,
 *   `update-ref` moves the base with a compare-and-swap on the old value): no temporary
 *   clone or worktree is created, so a crash cannot leave stray directories, and a
 *   concurrent push to the base makes the update fail instead of being overwritten. The merge
 *   is pinned to the head sha the gates judged, and a merge that would change nothing (the
 *   base already holds the PR, e.g. after a crash before the record was saved) is recorded
 *   as merged instead of writing an empty commit.
 *   Failures are `GitHostError` so the engine branches on `errorFamily` (d-0062).
 *
 * Exports: createLocalBareGitHost().
 * Depends on: node:path, node:url, @forge/core, adapters/git-cli/{run-git,fetch-base}, adapters/local-bare/pr-store,
 *   domain/ref-check, shared/host-errors, schemas/pr-record. IO: runs git, reads and writes PR records.
 */

import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { HeadMovedError, MergeConflictError } from '@forge/core';
import type { GitHost, MergeMethod, PrStatus, PullRequest } from '@forge/core';
import { fetchBase } from '#/adapters/git-cli/fetch-base.js';
import { createGitRunner } from '#/adapters/git-cli/run-git.js';
import { createPrStore } from '#/adapters/local-bare/pr-store.js';
import { assertSafeRefArg } from '#/domain/ref-check.js';
import type { PrRecord } from '#/schemas/pr-record.js';
import { GitHostError } from '#/shared/host-errors.js';
import type { BaseLanding, LocalBareGitHostOptions } from '#/types/git-host.types.js';

const DEFAULT_AUTHOR = { name: 'Forge', email: 'forge@localhost' } as const;

/** Creates a GitHost whose remote is a bare repository on disk. */
export function createLocalBareGitHost(opts: LocalBareGitHostOptions): GitHost {
  const git = opts.git ?? createGitRunner(opts.gitBinary ?? 'git');
  const remote = resolve(opts.remotePath);
  const author = opts.author ?? DEFAULT_AUTHOR;
  const store = createPrStore(remote);
  const iso = (): string => new Date(opts.now()).toISOString();
  const urlOf = (n: number): string =>
    pathToFileURL(resolve(remote, 'forge-prs', `${n}.json`)).href;

  /** The old value makes this a compare-and-swap: a base that moved meanwhile fails loudly. */
  const landing: BaseLanding = opts.landing ?? {
    async land({ base, baseSha, newSha }) {
      const moved = await git.try(remote, [
        'update-ref',
        `refs/heads/${base}`,
        newSha,
        baseSha,
      ]);

      if (moved.code !== 0) {
        throw new GitHostError('merge_refused', `${base} moved during the merge`);
      }
    },
  };

  /** Commit a ref points to in the bare repo, or null when the ref does not exist. */
  const refSha = async (branch: string): Promise<string | null> => {
    const r = await git.try(remote, [
      'rev-parse',
      '--verify',
      '--quiet',
      `refs/heads/${branch}^{commit}`,
    ]);

    return r.code === 0 ? r.stdout.trim() : null;
  };

  const checkBranch = async (label: string, branch: string): Promise<void> => {
    assertSafeRefArg(label, branch);
    const r = await git.try(remote, ['check-ref-format', '--branch', branch]);
    if (r.code !== 0) {
      throw new GitHostError('invalid', `invalid ${label}: ${branch}`);
    }
  };

  /** Merged tree of base and head, or null when they conflict. Never writes a ref. */
  const mergedTree = async (baseSha: string, headSha: string): Promise<string | null> => {
    const r = await git.try(remote, ['merge-tree', '--write-tree', baseSha, headSha]);
    if (r.code === 0) {
      return r.stdout.split('\n')[0]?.trim() ?? null;
    }

    if (r.code === 1) {
      return null;
    }

    throw new GitHostError('unavailable', `git merge-tree failed: ${r.stderr.trim()}`);
  };

  const toStatus = async (rec: PrRecord): Promise<PrStatus> => {
    if (rec.state === 'merged') {
      return { state: 'merged', mergeable: null, headSha: rec.merged_head_sha ?? '' };
    }

    const head = await refSha(rec.branch);
    if (rec.state === 'closed') {
      return { state: 'closed', mergeable: null, headSha: head ?? '' };
    }

    const base = await refSha(rec.base);
    if (head === null || base === null) {
      throw new GitHostError(
        'not_found',
        `branch ${head === null ? rec.branch : rec.base} is gone`,
      );
    }

    return {
      state: 'open',
      mergeable: (await mergedTree(base, head)) !== null,
      headSha: head,
    };
  };

  return {
    async push(worktreePath, branch) {
      await checkBranch('branch', branch);
      await git.run(worktreePath, ['push', remote, `${branch}:${branch}`], {
        env: { GIT_TERMINAL_PROMPT: '0' },
      });
    },

    async openPr({ branch, base, title, body }): Promise<PullRequest> {
      await checkBranch('branch', branch);
      await checkBranch('base', base);
      if ((await refSha(branch)) === null) {
        throw new GitHostError('invalid', `branch ${branch} has not been pushed`);
      }

      if ((await refSha(base)) === null) {
        throw new GitHostError('invalid', `base branch ${base} does not exist`);
      }

      // One open PR per head branch: the same refusal GitHub gives (422).
      const rec = await store.create((number, existing) => {
        if (existing.some((r) => r.state === 'open' && r.branch === branch)) {
          throw new GitHostError('invalid', `an open PR already exists for ${branch}`);
        }

        return { number, branch, base, title, body, state: 'open', created_at: iso() };
      });

      return { number: rec.number, url: urlOf(rec.number) };
    },

    async findPr(branch) {
      await checkBranch('branch', branch);
      const open = (await store.all()).filter(
        (r) => r.state === 'open' && r.branch === branch,
      );

      const rec = open.sort((a, b) => b.number - a.number)[0];

      return rec ? { number: rec.number, url: urlOf(rec.number) } : null;
    },

    async prStatus(n) {
      return toStatus(await store.get(n));
    },

    merge: (n, method: MergeMethod, expectedHeadSha) =>
      store.locked(async () => {
        const rec = await store.get(n);
        if (rec.state !== 'open') {
          throw new GitHostError('merge_refused', `PR ${n} is ${rec.state}, not open`);
        }

        const base = await refSha(rec.base);
        const head = await refSha(rec.branch);
        if (base === null || head === null) {
          throw new GitHostError(
            'not_found',
            `branch ${base === null ? rec.base : rec.branch} is gone`,
          );
        }

        // Under the store lock, so a push that lands after this check still cannot be merged:
        // the branch ref is read once and every later step uses that sha.
        if (head !== expectedHeadSha) {
          throw new HeadMovedError(
            `PR ${n} head is ${head}, not the ${expectedHeadSha} the gates judged`,
          );
        }

        const tree = await mergedTree(base, head);
        if (tree === null) {
          // A clash is work to do, not a policy answer: the engine merges the base in and retries.
          throw new MergeConflictError(`PR ${n} has merge conflicts with ${rec.base}`);
        }

        // A crash between `update-ref` and the record save leaves the base already holding
        // this PR's changes while the record still says open. Merging again would write an
        // empty commit, so when the merge changes nothing the PR is recorded as merged at the
        // current base instead.
        const baseTree = (await git.run(remote, ['rev-parse', `${base}^{tree}`])).trim();
        if (tree === baseTree) {
          await store.save({
            ...rec,
            state: 'merged',
            merged_sha: base,
            merged_head_sha: head,
          });

          return { sha: base };
        }

        // merge = two parents (a true --no-ff merge commit); squash = one parent, same tree.
        const parents = method === 'merge' ? ['-p', base, '-p', head] : ['-p', base];
        const when = iso();
        const sha = (
          await git.run(
            remote,
            [
              '-c',
              'commit.gpgsign=false',
              'commit-tree',
              tree,
              ...parents,
              '-m',
              `${rec.title} (#${n})`,
            ],
            {
              env: {
                GIT_AUTHOR_NAME: author.name,
                GIT_AUTHOR_EMAIL: author.email,
                GIT_AUTHOR_DATE: when,
                GIT_COMMITTER_NAME: author.name,
                GIT_COMMITTER_EMAIL: author.email,
                GIT_COMMITTER_DATE: when,
              },
            },
          )
        ).trim();

        await landing.land({ base: rec.base, baseSha: base, newSha: sha });

        await store.save({
          ...rec,
          state: 'merged',
          merged_sha: sha,
          merged_head_sha: head,
        });

        return { sha };
      }),

    closePr: (n) =>
      store.locked(async () => {
        const rec = await store.get(n);
        if (rec.state === 'closed') {
          return;
        }

        if (rec.state === 'merged') {
          throw new GitHostError('invalid', `PR ${n} is already merged`);
        }

        await store.save({ ...rec, state: 'closed' });
      }),

    syncBase: () =>
      fetchBase(git, {
        localRepo: opts.localRepo,
        source: remote,
        branch: opts.baseBranch,
      }),

    async deleteBranch(branch) {
      await checkBranch('branch', branch);
      if (branch === opts.baseBranch) {
        throw new GitHostError('invalid', `refusing to delete the base branch ${branch}`);
      }

      // `update-ref -d` on a ref that does not exist succeeds, so this is idempotent.
      await git.run(remote, ['update-ref', '-d', `refs/heads/${branch}`]);
    },
  };
}
