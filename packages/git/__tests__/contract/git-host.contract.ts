/**
 * Contract every `GitHost` must pass: `describeGitHostContract(name, make)`.
 *
 * Why: the engine opens a PR, reads its status, merges it once the gates pass, and cleans
 *   up, and must not care whether the host is a bare repo on disk or GitHub. This pins the
 *   shared behaviour: a pushed branch can be opened as a PR with its head sha, merging
 *   moves the base branch to the returned sha, a PR that is closed or already merged
 *   cannot be merged again (a `policy_denied` answer, never retried), `findPr` finds only an
 *   open PR for a branch (so a caller that crashed after `openPr` adopts it), a second open PR
 *   for one branch is refused, an unknown PR is an `invalid_input` error, and deleting a
 *   branch is idempotent. A new host passes this before it gets tests of its own.
 *
 * Exports: GitHostHarness, describeGitHostContract().
 * Depends on: vitest, @forge/core (GitHost, ForgeError).
 */

import { ForgeError } from '@forge/core';
import type { GitHost } from '@forge/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/** A host plus the probes the contract needs to see the remote's state. */
export interface GitHostHarness {
  readonly host: GitHost;
  readonly baseBranch: string;
  /** Puts a new branch with one extra commit on the remote (through `host.push` where the host can) and returns its head sha. */
  seedBranch(branch: string): Promise<string>;
  branchExists(branch: string): Promise<boolean>;
  /** Head sha of the base branch on the remote. */
  baseSha(): Promise<string>;
  close(): Promise<void>;
}

export function describeGitHostContract(
  name: string,
  make: () => Promise<GitHostHarness>,
): void {
  describe(`GitHost contract: ${name}`, { timeout: 60_000 }, () => {
    let h: GitHostHarness;
    // Real git per case is slow on Windows when the whole suite runs in parallel.
    beforeEach(async () => {
      h = await make();
    }, 60_000);

    afterEach(async () => {
      await h.close();
    });

    const open = async (branch: string) =>
      h.host.openPr({
        branch,
        base: h.baseBranch,
        title: `Change ${branch}`,
        body: 'body',
      });

    it('opens a PR for a pushed branch and reports it open with the head sha', async () => {
      const head = await h.seedBranch('feat/a');

      const pr = await open('feat/a');
      const status = await h.host.prStatus(pr.number);

      expect(pr.number).toBeGreaterThan(0);
      expect(pr.url.length).toBeGreaterThan(0);
      expect(status).toEqual({ state: 'open', mergeable: true, headSha: head });
    });

    it('findPr returns the open PR for a branch, and null when there is none', async () => {
      await h.seedBranch('feat/a');
      await h.seedBranch('feat/b');
      expect(await h.host.findPr('feat/a')).toBeNull();

      const pr = await open('feat/a');

      expect(await h.host.findPr('feat/a')).toEqual({ number: pr.number, url: pr.url });
      expect(await h.host.findPr('feat/b')).toBeNull();
    });

    it('findPr ignores closed and merged PRs', async () => {
      await h.seedBranch('feat/a');
      await h.seedBranch('feat/b');
      const closed = await open('feat/a');
      const merged = await open('feat/b');
      await h.host.closePr(closed.number);
      await h.host.merge(merged.number, 'squash');

      expect(await h.host.findPr('feat/a')).toBeNull();
      expect(await h.host.findPr('feat/b')).toBeNull();
    });

    it('numbers PRs per repository, each distinct', async () => {
      await h.seedBranch('feat/a');
      await h.seedBranch('feat/b');

      const a = await open('feat/a');
      const b = await open('feat/b');

      expect(b.number).not.toBe(a.number);
    });

    it('refuses a second open PR for the same branch', async () => {
      await h.seedBranch('feat/a');
      await open('feat/a');

      await expect(open('feat/a')).rejects.toMatchObject({
        errorFamily: 'invalid_input',
      });
    });

    it('squash-merges: the base branch moves to the returned sha and the PR reads merged', async () => {
      await h.seedBranch('feat/a');
      const pr = await open('feat/a');
      const before = await h.baseSha();

      const { sha } = await h.host.merge(pr.number, 'squash');

      expect(sha).toMatch(/^[0-9a-z]{4,}$/);
      expect(sha).not.toBe(before);
      expect(await h.baseSha()).toBe(sha);
      expect((await h.host.prStatus(pr.number)).state).toBe('merged');
    });

    it('merge-method merge also moves the base branch', async () => {
      await h.seedBranch('feat/a');
      const pr = await open('feat/a');

      const { sha } = await h.host.merge(pr.number, 'merge');

      expect(await h.baseSha()).toBe(sha);
    });

    it('refuses to merge a PR twice, as a policy denial', async () => {
      await h.seedBranch('feat/a');
      const pr = await open('feat/a');
      await h.host.merge(pr.number, 'squash');

      const err = await h.host.merge(pr.number, 'squash').catch((e: unknown) => e);

      expect(err).toBeInstanceOf(ForgeError);
      expect(err).toMatchObject({ errorFamily: 'policy_denied' });
    });

    it('closing a PR is idempotent and a closed PR cannot be merged', async () => {
      await h.seedBranch('feat/a');
      const pr = await open('feat/a');

      await h.host.closePr(pr.number);
      await h.host.closePr(pr.number);

      expect((await h.host.prStatus(pr.number)).state).toBe('closed');
      await expect(h.host.merge(pr.number, 'squash')).rejects.toMatchObject({
        errorFamily: 'policy_denied',
      });
    });

    it('allows a new PR for a branch whose earlier PR was closed', async () => {
      await h.seedBranch('feat/a');
      const first = await open('feat/a');
      await h.host.closePr(first.number);

      const second = await open('feat/a');

      expect(second.number).not.toBe(first.number);
    });

    it('rejects an unknown PR number as invalid input', async () => {
      await expect(h.host.prStatus(9999)).rejects.toMatchObject({
        errorFamily: 'invalid_input',
      });
    });

    it('deletes a branch and tolerates deleting it again', async () => {
      await h.seedBranch('feat/a');

      await h.host.deleteBranch('feat/a');
      await h.host.deleteBranch('feat/a');

      expect(await h.branchExists('feat/a')).toBe(false);
    });

    it('refuses to delete the base branch', async () => {
      await expect(h.host.deleteBranch(h.baseBranch)).rejects.toMatchObject({
        errorFamily: 'invalid_input',
      });

      expect(await h.branchExists(h.baseBranch)).toBe(true);
    });
  });
}
