/**
 * Pins: how the GitHub App host fetches the base branch into the local repository.
 *
 * Why: merging a moved base into a ticket branch needs the base's current tip locally, and the
 *   fetch authenticates as the installation. The token must reach git only through the child's
 *   environment, never argv or an error message, and the fetch must write only the private
 *   `refs/forge/base/<branch>` ref, never a branch the user works on. The real fetch against a
 *   git remote is covered by the host contract; here git is replaced by a recording runner.
 *
 * Pins: fetch argv and cwd, refspec into the private ref, env-only auth, token scrubbed from a
 * failed fetch, a refused sync without a local repository, a missing remote branch.
 * Depends on: src/index, src/domain/push-env.
 */

import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildPushEnv } from '#/domain/push-env.js';
import { createGitHubAppGitHost } from '#/index.js';
import type { GitResult, GitRunner } from '#/types/git-worktree.types.js';
import { rejection } from '#tests/helpers/rejection.js';

const keys = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const TOKEN = 'ghs_secretTOKEN123';
const NOW = Date.parse('2026-10-13T10:00:00.000Z');
const SHA = 'a'.repeat(40);

const tokenFetch: typeof fetch = async () =>
  new Response(JSON.stringify({ token: TOKEN, expires_at: '2026-10-13T11:00:00Z' }), {
    status: 201,
  });

function rig(fetchResult: GitResult, localRepo: string | null = 'C:/repo') {
  const fetches: {
    cwd: string;
    args: readonly string[];
    env: Record<string, string> | undefined;
  }[] = [];

  const git: GitRunner = {
    run: async () => `${SHA}\n`,
    try: async (cwd, args, opts) => {
      if (args[0] !== 'fetch') {
        return { code: 0, stdout: '', stderr: '' };
      }

      fetches.push({ cwd, args, env: opts?.env ? { ...opts.env } : undefined });

      return fetchResult;
    },
  };

  const host = createGitHubAppGitHost({
    owner: 'o',
    repo: 'r',
    baseBranch: 'main',
    appId: '123',
    installationId: '456',
    privateKey: async () => Buffer.from(keys.privateKey),
    fetch: tokenFetch,
    now: () => NOW,
    git,
    ...(localRepo === null ? {} : { localRepo }),
  });

  return { host, fetches };
}

describe('github app syncBase', () => {
  it('fetches the base into the private ref of the local repository, with the token only in the environment', async () => {
    const { host, fetches } = rig({ code: 0, stdout: '', stderr: '' });

    const tip = await host.syncBase();

    expect(tip).toEqual({ ref: 'refs/forge/base/main', sha: SHA });
    expect(fetches).toHaveLength(1);
    expect(fetches[0]?.cwd).toBe('C:/repo');
    expect(fetches[0]?.args).toEqual([
      'fetch',
      '--quiet',
      '--no-tags',
      'https://github.com/o/r.git',
      '+refs/heads/main:refs/forge/base/main',
    ]);

    expect(JSON.stringify(fetches[0]?.args)).not.toContain(TOKEN);
    expect(fetches[0]?.env).toEqual(buildPushEnv(TOKEN));
  });

  it('scrubs the token from a failed fetch and reports it as unavailable', async () => {
    const { host } = rig({
      code: 128,
      stdout: '',
      stderr: `fatal: unable to access: header AUTHORIZATION: basic ${Buffer.from(`x-access-token:${TOKEN}`).toString('base64')} for ${TOKEN}`,
    });

    const err = await rejection(host.syncBase());

    expect(err).toMatchObject({ errorFamily: 'crash', reason: 'unavailable' });
    expect(err.message).not.toContain(TOKEN);
    expect(err.message).not.toContain(
      Buffer.from(`x-access-token:${TOKEN}`).toString('base64'),
    );
  });

  it('says so when the base branch is not on the remote', async () => {
    const { host } = rig({
      code: 128,
      stdout: '',
      stderr: "fatal: couldn't find remote ref refs/heads/main",
    });

    await expect(host.syncBase()).rejects.toMatchObject({ reason: 'not_found' });
  });

  it('refuses to sync when no local repository was given', async () => {
    const { host, fetches } = rig({ code: 0, stdout: '', stderr: '' }, null);

    await expect(host.syncBase()).rejects.toMatchObject({
      errorFamily: 'invalid_input',
    });

    expect(fetches).toHaveLength(0);
  });
});
