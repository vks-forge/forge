/**
 * Pins: how the GitHub App host recovers a rejected token and pins merges to a commit.
 *
 * Why: an installation token can be revoked while still inside its hour (the App was
 * reinstalled, a key rotated), and one dead token must not park every ticket for a human;
 * a merge must land only on the commit the gates judged, and a refusal that just means
 * "a branch was modified a moment ago" must be told apart from a conflict that needs a
 * person (d-0062).
 *
 * Pins: 401 and non-quota 403 mint a new token and retry once (a quota 403 does not); the
 * merge sends the judged sha and a GitHub 409 becomes HeadMovedError; a "modified" 405/409
 * is retryable `merge_busy`; other refusals stay policy denials; deleting a branch that is
 * already gone (404 or 422) is fine.
 * Depends on: helpers/github-rig, helpers/rejection, @forge/core.
 */

import { HeadMovedError, MergeConflictError } from '@forge/core';
import { afterEach, describe, expect, it } from 'vitest';
import {
  closeGitHubRigs,
  makeGitHubRig as rig,
  openPr as open,
} from '#tests/helpers/github-rig.js';
import { rejection } from '#tests/helpers/rejection.js';

afterEach(closeGitHubRigs);

describe('github app host: token refresh and merge pinning', () => {
  it('drops a revoked token on 401, mints a new one and retries the call once', async () => {
    const r = await rig();
    r.server.branches.set('feat/a', 'sha1');
    const pr = await open(r, 'feat/a');
    r.server.revokeTokens();

    const status = await r.host.prStatus(pr.number);

    expect(status.state).toBe('open');
    expect(r.server.mints()).toBe(2);
    expect(r.server.authorizations.at(-1)).toBe('Bearer ghs_token2');
  });

  it('retries a 403 that is not a quota once with a fresh token, then surfaces auth', async () => {
    const r = await rig();
    r.server.branches.set('feat/a', 'sha1');
    const pr = await open(r, 'feat/a');
    r.server.failNext('GET', '/pulls/', 403);
    r.server.failNext('GET', '/pulls/', 403);

    await expect(r.host.prStatus(pr.number)).rejects.toMatchObject({
      errorFamily: 'auth',
      status: 403,
    });

    expect(r.server.mints()).toBe(2);
  });

  it('does not mint again for a 403 that is a rate limit', async () => {
    const r = await rig();
    r.server.branches.set('feat/a', 'sha1');
    const pr = await open(r, 'feat/a');
    r.server.failNext('GET', '/pulls/', 403, { 'x-ratelimit-remaining': '0' });

    await expect(r.host.prStatus(pr.number)).rejects.toMatchObject({
      errorFamily: 'rate_limit',
    });

    expect(r.server.mints()).toBe(1);
  });

  it('sends the judged head sha with the merge and turns GitHub 409 into HeadMovedError', async () => {
    const r = await rig();
    r.server.branches.set('feat/a', 'sha1');
    const pr = await open(r, 'feat/a');
    r.server.branches.set('feat/a', 'sha2');

    const err = await rejection(r.host.merge(pr.number, 'squash', 'sha1'));

    expect(err).toBeInstanceOf(HeadMovedError);
    expect(r.server.prs.get(pr.number)?.merged).toBe(false);
    await expect(r.host.merge(pr.number, 'squash', 'sha2')).resolves.toMatchObject({
      sha: expect.any(String),
    });
  });

  it.each([
    [405, 'Base branch was modified. Review and try the merge again.'],
    [409, 'Repository rule violations: branch was modified by another process'],
  ])(
    'treats a %i merge refusal that says "modified" as retryable, not a policy denial',
    async (status, message) => {
      const r = await rig();
      r.server.branches.set('feat/a', 'sha1');
      const pr = await open(r, 'feat/a');
      r.server.failNext('PUT', '/merge', status, {}, message);

      const err = await rejection(r.host.merge(pr.number, 'squash', 'sha1'));

      expect(err).toMatchObject({ errorFamily: 'rate_limit', reason: 'merge_busy' });
      expect(err).not.toBeInstanceOf(HeadMovedError);
    },
  );

  it.each([
    'Pull Request is not mergeable',
    'Merge conflict',
    'Head branch has conflicts with the base',
  ])(
    'reports a clash with the base as a merge conflict, not a policy refusal (405 %s)',
    async (message) => {
      const r = await rig();
      r.server.branches.set('feat/a', 'sha1');
      const pr = await open(r, 'feat/a');
      r.server.failNext('PUT', '/merge', 405, {}, message);

      const err = await r.host
        .merge(pr.number, 'squash', 'sha1')
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(MergeConflictError);
      expect(err).toMatchObject({ errorFamily: 'merge_conflict' });
    },
  );

  it('still parks a merge GitHub refuses for good (405 branch protection)', async () => {
    const r = await rig();
    r.server.branches.set('feat/a', 'sha1');
    const pr = await open(r, 'feat/a');
    r.server.failNext(
      'PUT',
      '/merge',
      405,
      {},
      'At least 1 approving review is required',
    );

    await expect(r.host.merge(pr.number, 'squash', 'sha1')).rejects.toMatchObject({
      errorFamily: 'policy_denied',
    });
  });

  it.each([404, 422])(
    'tolerates a %i when deleting a branch that is already gone',
    async (status) => {
      const r = await rig();
      r.server.branches.set('feat/a', 'sha1');
      r.server.failNext('DELETE', '/git/refs/', status);

      await expect(r.host.deleteBranch('feat/a')).resolves.toBeUndefined();
    },
  );
});
