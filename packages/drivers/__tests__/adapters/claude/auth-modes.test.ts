/**
 * Pins: login, API key and OAuth token modes of a Claude harness, for Workers and the Director.
 *
 * Why: the owner chooses per harness who pays for a run. The mode must put exactly one
 * credential variable into the child (read from the SecretStore for that run, never from the
 * server's own environment), the ACP gate must accept only the account kind that mode implies,
 * a missing key must stop the run before any process starts, and the secret must not leak into
 * the run's events, logs, result or files, because a Worker's output is read by the model and
 * the UI (d-0087).
 *
 * Depends on: helpers/claude-rigs, helpers/director-llm-rig, src/adapters/claude/claude-driver.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { AuthError } from '@forge/core';
import type { SecretStore } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createClaudeDriver } from '#/adapters/claude/claude-driver.js';
import { createClaudeDirectorLLM } from '#/adapters/claude/director-llm.js';
import { HarnessNotInstalledError } from '#/shared/errors.js';
import { makeAcpRig, makeCliRig, STREAM } from '#tests/helpers/claude-rigs.js';
import { makeDirectorRig } from '#tests/helpers/director-llm-rig.js';
import { TEST_CLAUDE } from '#tests/helpers/rig-base.js';
import { waitFor } from '#tests/helpers/wait-for.js';
import type { SpawnFn } from '#/types/claude/driver-deps.types.js';
import type { HarnessSetup } from '#/types/claude/harness.types.js';

const API_KEY = 'sk-ant-api03-SUPER-SECRET-VALUE';
const OAUTH = 'sk-ant-oat01-ANOTHER-SECRET-VALUE';

function fakeSecrets(values: Record<string, string>): SecretStore {
  const map = new Map(Object.entries(values));

  return {
    get: async (name) => {
      const v = map.get(name);

      return v === undefined ? null : new TextEncoder().encode(v);
    },
    put: async (name, bytes) => void map.set(name, new TextDecoder().decode(bytes)),
    delete: async (name) => void map.delete(name),
    list: async (prefix) => [...map.keys()].filter((k) => k.startsWith(prefix)).sort(),
  };
}

const STORED = {
  'harness/claude/api-key': API_KEY,
  'harness/claude/oauth-token': OAUTH,
};

const setup = (authMode: HarnessSetup['authMode']) => (): HarnessSetup => ({
  id: 'claude',
  binaryPath: TEST_CLAUDE,
  authMode,
});

function allFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);

    return statSync(p).isDirectory() ? allFiles(p) : [p];
  });
}

describe('ACP engine: auth modes', () => {
  it('api_key injects ANTHROPIC_API_KEY for this run and accepts the api_key report', async () => {
    const rig = makeAcpRig({ envPassthrough: ['CLAUDE_CODE_OAUTH_TOKEN'] });
    rig.next = { auth: 'api_key', steering: true };
    const driver = createClaudeDriver({
      ...rig.deps,
      harness: setup('api_key'),
      secrets: fakeSecrets(STORED),
      baseEnv: { ...rig.deps.baseEnv, CLAUDE_CODE_OAUTH_TOKEN: 'host-token' },
    });

    const result = await driver.result(await driver.start(rig.request()));
    const env = rig.spawns[0]?.options.env ?? {};
    expect(result.status).toBe('success');
    expect(env['ANTHROPIC_API_KEY']).toBe(API_KEY);
    expect(env).not.toHaveProperty('CLAUDE_CODE_OAUTH_TOKEN');
    expect(env['CLAUDE_CODE_EXECUTABLE']).toBe(TEST_CLAUDE);
  });

  it('api_key does not start a session on a subscription report; it ends as auth naming what was reported', async () => {
    const rig = makeAcpRig({ authTimeoutMs: 1_000 });
    rig.next = { auth: 'account', steering: true };
    const driver = createClaudeDriver({
      ...rig.deps,
      harness: setup('api_key'),
      secrets: fakeSecrets(STORED),
    });

    const handle = await driver.start(rig.request());
    await waitFor(() => rig.logs.some((l) => l.message === 'adapter auth status'));
    await rig.clock.advance(1_000);
    const result = await driver.result(handle);
    const events: unknown[] = [];
    for await (const e of driver.events(handle)) {
      events.push(e);
    }

    expect(result).toMatchObject({ status: 'error', errorFamily: 'auth' });
    expect(JSON.stringify(events)).toContain('reported: account');
    expect(rig.agents[0]?.methods()).not.toContain('session/new');
  });

  it('oauth_token injects CLAUDE_CODE_OAUTH_TOKEN and accepts any report, logging only the kind', async () => {
    const rig = makeAcpRig();
    rig.next = { auth: 'none', steering: true };
    const driver = createClaudeDriver({
      ...rig.deps,
      harness: setup('oauth_token'),
      secrets: fakeSecrets(STORED),
    });

    const result = await driver.result(await driver.start(rig.request()));
    const env = rig.spawns[0]?.options.env ?? {};
    expect(result.status).toBe('success');
    expect(env['CLAUDE_CODE_OAUTH_TOKEN']).toBe(OAUTH);
    expect(env).not.toHaveProperty('ANTHROPIC_API_KEY');
    expect(rig.logs.find((l) => l.message === 'adapter auth status')?.fields).toEqual({
      authMode: 'oauth_token',
      kind: 'none',
    });
  });

  it('login never carries a credential variable, even one the server allowed through', async () => {
    const rig = makeAcpRig({
      envPassthrough: ['ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN'],
    });

    const driver = createClaudeDriver({
      ...rig.deps,
      harness: setup('login'),
      secrets: fakeSecrets(STORED),
      baseEnv: {
        ...rig.deps.baseEnv,
        ANTHROPIC_API_KEY: 'host-key',
        CLAUDE_CODE_OAUTH_TOKEN: 'host-token',
      },
    });

    await driver.result(await driver.start(rig.request()));
    const env = rig.spawns[0]?.options.env ?? {};
    expect(env).not.toHaveProperty('ANTHROPIC_API_KEY');
    expect(env).not.toHaveProperty('CLAUDE_CODE_OAUTH_TOKEN');
  });

  it('a harness set to api_key with no stored key fails the start with an auth error and spawns nothing', async () => {
    const rig = makeAcpRig();
    const driver = createClaudeDriver({
      ...rig.deps,
      harness: setup('api_key'),
      secrets: fakeSecrets({}),
    });

    const failure = await driver.start(rig.request()).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(AuthError);
    expect(rig.spawns).toHaveLength(0);
  });

  it('the secret value appears in no run event, log line, result or run file', async () => {
    const rig = makeAcpRig();
    const driver = createClaudeDriver({
      ...rig.deps,
      harness: setup('api_key'),
      secrets: fakeSecrets(STORED),
    });

    rig.next = { auth: 'api_key', steering: true };
    const handle = await driver.start(rig.request());
    const events: unknown[] = [];
    for await (const e of driver.events(handle)) {
      events.push(e);
    }

    const result = await driver.result(handle);
    const files = allFiles(rig.runsRoot).map((f) => readFileSync(f, 'utf8'));
    const everything = JSON.stringify({ events, result, logs: rig.logs, files });
    expect(events.length).toBeGreaterThan(0);
    expect(everything).not.toContain(API_KEY);
    expect(everything).not.toContain(OAUTH);
  });
});

describe('CLI engine: auth modes', { timeout: 30_000 }, () => {
  it('runs the installed claude with the injected key', async () => {
    const rig = makeCliRig();
    rig.fixture([STREAM.init, STREAM.result()]);
    const started: string[] = [];
    const spawn: SpawnFn = (command, args, options) => {
      started.push(command);

      return rig.deps.spawn(command, args, options);
    };

    const driver = createClaudeDriver({
      ...rig.deps,
      spawn,
      harness: setup('api_key'),
      secrets: fakeSecrets(STORED),
    });

    const result = await driver.result(await driver.start(rig.request()));
    expect(result.status).toBe('success');
    expect(started).toEqual([TEST_CLAUDE]);
    expect(rig.lastCall().env['ANTHROPIC_API_KEY']).toBe(API_KEY);
    expect(JSON.stringify(result)).not.toContain(API_KEY);
  });
});

describe('Director LLM: same resolution and auth', { timeout: 30_000 }, () => {
  const Answer = z.object({ answer: z.string() });
  const opts = { model: 'haiku', budgetUsd: 0.05 };

  it('injects the stored key into the step child and nothing else credential-shaped', async () => {
    const rig = makeDirectorRig({
      harness: setup('api_key'),
      secrets: fakeSecrets(STORED),
    });

    rig.script({ kind: 'valid', value: { answer: 'ok' } });
    const r = await rig.llm.step('triage', {}, Answer, opts);
    const env = rig.lastCall().env;
    expect(r.ok).toBe(true);
    expect(env['ANTHROPIC_API_KEY']).toBe(API_KEY);
    expect(env).not.toHaveProperty('CLAUDE_CODE_OAUTH_TOKEN');
  });

  it('a missing key is an auth step error and nothing starts', async () => {
    const rig = makeDirectorRig({
      harness: setup('oauth_token'),
      secrets: fakeSecrets({}),
    });

    const r = await rig.llm.step('triage', {}, Answer, opts);
    expect(r.ok).toBe(false);
    expect(r.ok ? null : r.error.kind).toBe('auth');
    expect(rig.started()).toBe(false);
  });

  it('a missing install is a crash step error with the install pointer', async () => {
    const rig = makeDirectorRig();
    const llm = createClaudeDirectorLLM({
      ...rig.deps,
      fileExists: () => false,
      claudeBinary: 'claude',
      baseEnv: { PATH: '/nowhere' },
    });

    const r = await llm.step('triage', {}, Answer, opts);
    expect(r.ok).toBe(false);
    expect(r.ok ? null : r.error.kind).toBe('crash');
    expect(r.ok ? '' : r.error.message).toContain(
      'https://code.claude.com/docs/en/setup',
    );

    expect(new HarnessNotInstalledError('x').errorFamily).toBe('invalid_input');
  });
});
