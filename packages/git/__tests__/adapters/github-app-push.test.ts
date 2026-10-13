/**
 * Pins: how the GitHub App host runs `git push` and signs its JWT.
 *
 * Why: the installation token is the one credential that can write to the repository. It
 * must reach git only through the child's environment (`GIT_CONFIG_*`), never argv, the
 * URL, or an error message; and the JWT must carry the claims GitHub requires with a
 * signature that verifies against the App's public key. Live GitHub is covered by a probe;
 * here git is replaced by a recording runner.
 *
 * Pins: push argv holds no token, env holds the scoped extraheader and no prompt, runner
 * errors are scrubbed, JWT claims and signature, redactSecrets covers the base64 form.
 * Depends on: src/index, src/adapters/github-app/app-jwt, src/domain/push-env, node:crypto.
 */

import { createVerify, generateKeyPairSync } from 'node:crypto';
import { CrashError } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { createAppJwt } from '#/adapters/github-app/app-jwt.js';
import { buildPushEnv, redactSecrets } from '#/domain/push-env.js';
import { createGitHubAppGitHost } from '#/index.js';
import { rejection } from '#tests/helpers/rejection.js';
import type { GitRunner } from '#/types/git-worktree.types.js';

const keys = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
const TOKEN = 'ghs_secretTOKEN123';
const NOW = Date.parse('2026-10-13T10:00:00.000Z');

const tokenFetch: typeof fetch = async () =>
  new Response(JSON.stringify({ token: TOKEN, expires_at: '2026-10-13T11:00:00Z' }), {
    status: 201,
  });

function pushRig(run: GitRunner['run']) {
  const calls: {
    cwd: string;
    args: readonly string[];
    env: Record<string, string> | undefined;
  }[] = [];
  const git: GitRunner = {
    run: async (cwd, args, opts) => {
      calls.push({ cwd, args, env: opts?.env ? { ...opts.env } : undefined });
      return run(cwd, args, opts);
    },
    try: async () => ({ code: 0, stdout: '', stderr: '' }),
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
  });
  return { host, calls };
}

describe('github app push', () => {
  it('pushes branch:branch to the repo URL with the token only in the environment', async () => {
    const { host, calls } = pushRig(async () => '');

    await host.push('C:/repo/.worktrees/FRG-1', 'feat/FRG-1-a');

    const [call] = calls;
    expect(call?.cwd).toBe('C:/repo/.worktrees/FRG-1');
    expect(call?.args).toEqual([
      'push',
      'https://github.com/o/r.git',
      'feat/FRG-1-a:feat/FRG-1-a',
    ]);
    expect(JSON.stringify(call?.args)).not.toContain(TOKEN);
    expect(call?.env).toEqual(buildPushEnv(TOKEN));
    const basic = (call?.env?.['GIT_CONFIG_VALUE_0'] ?? '').replace(
      'AUTHORIZATION: basic ',
      '',
    );
    expect(Buffer.from(basic, 'base64').toString()).toBe(`x-access-token:${TOKEN}`);
    expect(call?.env).toMatchObject({
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader',
      GIT_TERMINAL_PROMPT: '0',
    });
  });

  it('scrubs the token from a failing git invocation', async () => {
    const basic = Buffer.from(`x-access-token:${TOKEN}`).toString('base64');
    const { host } = pushRig(async () => {
      throw new CrashError(`git push failed (exit 128): header ${basic} and ${TOKEN}`);
    });

    const err = await rejection(host.push('C:/wt', 'feat/a'));

    expect(err).toMatchObject({ errorFamily: 'crash' });
    expect(err.message).toContain('git push failed');
    expect(err.message).not.toContain(TOKEN);
    expect(err.message).not.toContain(basic);
  });

  it('refuses a branch that looks like an option before touching git', async () => {
    const { host, calls } = pushRig(async () => '');

    await expect(host.push('C:/wt', '--receive-pack=x')).rejects.toMatchObject({
      errorFamily: 'invalid_input',
    });
    expect(calls).toEqual([]);
  });
});

describe('github app JWT', () => {
  it('has RS256 header, iat 60s back, exp 9 minutes ahead, iss = app id, and verifies', () => {
    const jwt = createAppJwt('123', Buffer.from(keys.privateKey), NOW);
    const [h, p, s] = jwt.split('.') as [string, string, string];

    expect(JSON.parse(Buffer.from(h, 'base64url').toString())).toEqual({
      alg: 'RS256',
      typ: 'JWT',
    });
    expect(JSON.parse(Buffer.from(p, 'base64url').toString())).toEqual({
      iat: NOW / 1000 - 60,
      exp: NOW / 1000 + 540,
      iss: '123',
    });
    expect(
      createVerify('RSA-SHA256')
        .update(`${h}.${p}`)
        .verify(keys.publicKey, Buffer.from(s, 'base64url')),
    ).toBe(true);
  });
});

describe('redactSecrets', () => {
  it('replaces plain and basic-encoded secrets and ignores empty ones', () => {
    const basic = Buffer.from('x-access-token:abc').toString('base64');

    expect(redactSecrets(`a abc b ${basic}`, ['abc', ''])).toBe(
      'a [redacted] b [redacted]',
    );
  });
});
