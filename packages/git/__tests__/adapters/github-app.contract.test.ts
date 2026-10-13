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
 * Depends on: contract/git-host.contract, helpers/fake-github-server, src/index, node:crypto.
 */

import { generateKeyPairSync } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { createGitHubAppGitHost } from '#/index.js';
import type { GitHubAppGitHostOptions } from '#/index.js';
import { describeGitHostContract } from '#tests/contract/git-host.contract.js';
import type { GitHostHarness } from '#tests/contract/git-host.contract.js';
import { rejection } from '#tests/helpers/rejection.js';
import { startFakeGitHub } from '#tests/helpers/fake-github-server.js';
import type { FakeGitHub } from '#tests/helpers/fake-github-server.js';

const keys = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const otherKeys = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const T0 = Date.parse('2026-10-13T10:00:00.000Z');
const MIN = 60_000;
const cleanups: (() => Promise<void>)[] = [];

interface Rig {
  readonly server: FakeGitHub;
  readonly host: ReturnType<typeof createGitHubAppGitHost>;
  clock: { t: number };
}

async function rig(extra: Partial<GitHubAppGitHostOptions> = {}): Promise<Rig> {
  const clock = { t: T0 };
  const server = await startFakeGitHub({
    owner: 'o',
    repo: 'r',
    appId: '123',
    installationId: '456',
    publicKeyPem: keys.publicKey,
    now: () => clock.t,
  });

  cleanups.push(server.close);
  const host = createGitHubAppGitHost({
    owner: 'o',
    repo: 'r',
    baseBranch: 'main',
    appId: '123',
    installationId: '456',
    privateKey: async () => Buffer.from(keys.privateKey),
    apiBase: server.apiBase,
    now: () => clock.t,
    ...extra,
  });

  return { server, host, clock };
}

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((c) => c()));
});

describeGitHostContract('github app (fake server)', async (): Promise<GitHostHarness> => {
  const { server, host } = await rig();
  let n = 0;

  return {
    host,
    baseBranch: 'main',
    async seedBranch(branch) {
      const sha = `sha${(n += 1)}`;
      server.branches.set(branch, sha);

      return sha;
    },
    branchExists: async (b) => server.branches.has(b),
    baseSha: async () => server.baseSha(),
    close: server.close,
  };
});

const open = (r: Rig, branch: string) =>
  r.host.openPr({ branch, base: 'main', title: 't', body: 'b' });

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

      const call =
        method === 'GET' ? r.host.prStatus(pr.number) : r.host.merge(pr.number, 'squash');

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
