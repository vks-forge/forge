/**
 * Pins: the GitHub App GitHost satisfies the contract against a fake GitHub server, and
 * its own guarantees: the installation-token request carries a valid RS256 JWT, the token
 * is minted once and cached until five minutes before expiry (also under concurrency),
 * statuses map to the right error family, no credential reaches an error message, and
 * push hands the token to git only through environment config.
 *
 * Why: this host holds the only credential that can write to the user's repository. A
 * token in argv or a log line, a mint per call, or a 409 retried as if transient would
 * each be a security or reliability bug the engine cannot see from outside (d-0062).
 *
 * Depends on: contract/git-host.contract, helpers/github-rig.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { describeGitHostContract } from '#tests/contract/git-host.contract.js';
import type { GitHostHarness } from '#tests/contract/git-host.contract.js';
import {
  MIN,
  T0,
  closeGitHubRigs,
  makeGitHubRig as rig,
  openPr,
  otherKeys,
} from '#tests/helpers/github-rig.js';
import { makeGitHubSyncFixture } from '#tests/helpers/github-sync-fixture.js';
import { rejection } from '#tests/helpers/rejection.js';

afterEach(closeGitHubRigs);

describeGitHostContract('github app (fake server)', async (): Promise<GitHostHarness> => {
  const fx = await makeGitHubSyncFixture();
  const { server, host } = await rig({ gitBase: fx.gitBase, localRepo: fx.localRepo });
  let n = 0;

  return {
    host,
    baseBranch: 'main',
    sync: {
      ref: 'refs/forge/base/main',
      advanceBase: fx.advanceBase,
      resolveRef: fx.resolveRef,
    },
    async seedBranch(branch) {
      const sha = `sha${(n += 1)}`;
      server.branches.set(branch, sha);

      return sha;
    },
    branchExists: async (b) => server.branches.has(b),
    baseSha: async () => server.baseSha(),
    close: async () => {
      await server.close();
      await fx.cleanup();
    },
  };
});

const open = openPr;

describe('github app host specifics', () => {
  it('mints one installation token with a verified JWT and reuses it', async () => {
    const r = await rig();
    r.server.branches.set('feat/a', 'sha1');

    const pr = await open(r, 'feat/a');
    await r.host.prStatus(pr.number);
    await r.host.closePr(pr.number);

    expect(r.server.mints()).toBe(1);
    expect(r.server.authorizations.slice(1).every((a) => a === 'Bearer ghs_token1')).toBe(
      true,
    );
  });

  it('mints a fresh token once the cached one is within five minutes of expiry', async () => {
    const r = await rig();
    r.server.branches.set('feat/a', 'sha1');
    const pr = await open(r, 'feat/a');

    r.clock.t = T0 + 54 * MIN;
    await r.host.prStatus(pr.number);
    expect(r.server.mints()).toBe(1);

    r.clock.t = T0 + 56 * MIN;
    await r.host.prStatus(pr.number);
    expect(r.server.mints()).toBe(2);
  });

  it('shares one mint between concurrent calls', async () => {
    const r = await rig();
    r.server.branches.set('feat/a', 'sha1');
    const pr = await open(r, 'feat/a');
    r.clock.t = T0 + 58 * MIN;

    await Promise.all([1, 2, 3, 4].map(() => r.host.prStatus(pr.number)));

    expect(r.server.mints()).toBe(2);
  });

  it('rejects a JWT signed by a different key as an auth error without echoing key material', async () => {
    const r = await rig({ privateKey: async () => Buffer.from(otherKeys.privateKey) });

    const err = await rejection(open(r, 'feat/a'));

    expect(err).toMatchObject({ errorFamily: 'auth', reason: 'auth', status: 401 });
    expect(err.message).not.toContain('PRIVATE KEY');
  });

  it('reports an unreadable key as an auth error', async () => {
    const r = await rig({ privateKey: async () => Buffer.from('not a pem') });

    await expect(open(r, 'feat/a')).rejects.toMatchObject({ errorFamily: 'auth' });
  });

  it.each([
    ['GET', 401, {}, 'auth'],
    ['GET', 403, {}, 'auth'],
    ['GET', 403, { 'x-ratelimit-remaining': '0' }, 'rate_limit'],
    ['GET', 429, {}, 'rate_limit'],
    ['GET', 404, {}, 'invalid_input'],
    ['GET', 500, {}, 'crash'],
    ['PUT', 405, {}, 'policy_denied'],
    ['PUT', 409, {}, 'policy_denied'],
    ['PUT', 422, {}, 'invalid_input'],
  ] as const)(
    'maps %s %i %j to the %s family',
    async (method, status, headers, family) => {
      const r = await rig();
      r.server.branches.set('feat/a', 'sha1');
      const pr = await open(r, 'feat/a');
      r.server.failNext(method, '/pulls/', status, headers);
      if (family === 'auth') {
        // A rejected credential is retried once with a fresh token; the second refusal is real.
        r.server.failNext(method, '/pulls/', status, headers);
      }

      const call =
        method === 'GET'
          ? r.host.prStatus(pr.number)
          : r.host.merge(pr.number, 'squash', 'sha1');

      await expect(call).rejects.toMatchObject({ errorFamily: family });
    },
  );

  it('never puts the token in an error message even when the server echoes it', async () => {
    const r = await rig();
    r.server.branches.set('feat/a', 'sha1');
    const pr = await open(r, 'feat/a');
    r.server.failNext('GET', '/pulls/', 500);

    const err = await rejection(r.host.prStatus(pr.number));

    expect(err.message).toContain('failed (500)');
    expect(err.message).not.toContain('ghs_token1');
    expect(err.message).toContain('[redacted]');
  });

  it('truncates long error bodies', async () => {
    const r = await rig({
      fetch: async () => new Response('x'.repeat(5000), { status: 500 }),
    });

    const err = await rejection(open(r, 'feat/a'));

    expect(err.message.length).toBeLessThan(500);
  });

  it('reports a network failure as a crash-family error', async () => {
    const r = await rig({
      fetch: async () => {
        throw new TypeError('fetch failed');
      },
    });

    await expect(open(r, 'feat/a')).rejects.toMatchObject({ errorFamily: 'crash' });
  });

  it('refuses a pull request response that is not a pull request', async () => {
    const r = await rig({
      fetch: async (url, init) =>
        String(url).includes('/pulls')
          ? new Response('{"nope":1}', { status: 201 })
          : fetch(url, init),
    });

    await expect(open(r, 'feat/a')).rejects.toMatchObject({ errorFamily: 'crash' });
  });
});
