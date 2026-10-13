/**
 * Rig for the GitHub App host tests: a fake GitHub server plus a host pointed at it.
 *
 * Why: the contract suite and the token-refresh / merge-pinning suite both need the same
 *   wire-level setup (a server that verifies the App JWT, a clock they can move, a host that
 *   talks to it). Building it once keeps each suite about the behaviour it pins.
 *
 * Exports: keys, otherKeys, T0, MIN, GitHubRig, makeGitHubRig(), openPr(), closeGitHubRigs().
 * Depends on: helpers/fake-github-server, src/index, node:crypto.
 */

import { generateKeyPairSync } from 'node:crypto';
import { createGitHubAppGitHost } from '#/index.js';
import type { GitHubAppGitHostOptions } from '#/index.js';
import { startFakeGitHub } from '#tests/helpers/fake-github-server.js';
import type { FakeGitHub } from '#tests/helpers/fake-github-server.js';

const newKeys = () =>
  generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

export const keys = newKeys();
export const otherKeys = newKeys();
export const T0 = Date.parse('2026-10-13T10:00:00.000Z');
export const MIN = 60_000;
const cleanups: (() => Promise<void>)[] = [];

export interface GitHubRig {
  readonly server: FakeGitHub;
  readonly host: ReturnType<typeof createGitHubAppGitHost>;
  clock: { t: number };
}

export async function makeGitHubRig(
  extra: Partial<GitHubAppGitHostOptions> = {},
): Promise<GitHubRig> {
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

export const openPr = (r: GitHubRig, branch: string) =>
  r.host.openPr({ branch, base: 'main', title: 't', body: 'b' });

/** Stops every fake server the rigs started; call from `afterEach`. */
export async function closeGitHubRigs(): Promise<void> {
  await Promise.all(cleanups.splice(0).map((c) => c()));
}
