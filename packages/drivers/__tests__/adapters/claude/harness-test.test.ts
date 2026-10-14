/**
 * Pins: the harness "Test environment" check behind `POST /harnesses/:id/test`.
 *
 * Why: the owner must learn before running a ticket whether Forge finds `claude`, which
 * build it is and which credential it will really use, without paying for it. The paid
 * hello call must never happen unless asked, a stored key that the CLI does not pick up must
 * show as a mismatch, and the credential must reach the probe children but never the answer.
 *
 * Depends on: src/adapters/claude/harness-test, helpers/fake-child, helpers/fake-clock. No
 *   real processes.
 */

import type { SecretStore } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { testClaudeHarness } from '#/adapters/claude/harness-test.js';
import type { HarnessSetup } from '#/types/claude/harness.types.js';
import { createFakeChild, recordingSpawn } from '#tests/helpers/fake-child.js';
import { createFakeClock } from '#tests/helpers/fake-clock.js';

const CLAUDE = '/forge/test/bin/claude';
const KEY = 'sk-ant-api03-NEVER-IN-THE-ANSWER';

const status = (o: Record<string, unknown>): string =>
  JSON.stringify({ loggedIn: true, apiProvider: 'firstParty', ...o });

const ACCOUNT = status({ authMethod: 'claude.ai', subscriptionType: 'max' });
const API_KEY = status({ authMethod: 'api_key', apiKeySource: 'ANTHROPIC_API_KEY' });

function rig(answers: { status?: string; live?: string; version?: string | null }) {
  const clock = createFakeClock();
  const { spawn, calls } = recordingSpawn((call) => {
    const child = createFakeChild();
    const out = call.args.includes('--version')
      ? answers.version === undefined
        ? '2.1.299 (Claude Code)'
        : answers.version
      : call.args.includes('status')
        ? answers.status
        : answers.live;

    if (out === null || out === undefined) {
      setImmediate(() => child.exit(1));
    } else {
      child.stdoutPipe.write(out);
      child.exit(0);
    }

    return child;
  });

  const secrets: SecretStore = {
    get: async (name) =>
      name === 'harness/claude/api-key' ? new TextEncoder().encode(KEY) : null,
    put: async () => undefined,
    delete: async () => undefined,
    list: async () => [],
  };

  const test = (
    setup: HarnessSetup,
    live = false,
    over: { fileExists?: () => boolean } = {},
  ) =>
    testClaudeHarness(
      {
        spawn,
        clock,
        source: () => setup,
        secrets,
        baseEnv: { PATH: '/usr/bin', ANTHROPIC_API_KEY: 'server-key' },
        platform: 'linux',
        fileExists: () => true,
        ...over,
      },
      { live },
    );

  return { test, calls };
}

const login: HarnessSetup = { id: 'claude', binaryPath: CLAUDE, authMode: 'login' };
const apiKey: HarnessSetup = { id: 'claude', binaryPath: CLAUDE, authMode: 'api_key' };

describe('testClaudeHarness', () => {
  it('reports path, version and the active login without any paid call by default', async () => {
    const r = rig({ status: ACCOUNT });
    const result = await r.test(login);

    expect(result).toEqual({
      binary_path: CLAUDE,
      version: '2.1.299',
      auth_mode: 'login',
      ok: true,
      account_kind: 'account',
      live: 'skipped',
    });

    expect(r.calls.map((c) => c.args)).toEqual([
      ['--version'],
      ['auth', 'status', '--json'],
    ]);
  });

  it('runs the status check with the stored API key and never echoes it', async () => {
    const r = rig({ status: API_KEY });
    const result = await r.test(apiKey);

    expect(result).toMatchObject({
      ok: true,
      account_kind: 'api_key',
      auth_mode: 'api_key',
    });

    expect(r.calls.every((c) => c.options.env?.['ANTHROPIC_API_KEY'] === KEY)).toBe(true);
    expect(JSON.stringify(result)).not.toContain(KEY);
  });

  it('flags a stored key the CLI does not pick up as a mismatch', async () => {
    const result = await rig({ status: ACCOUNT }).test(apiKey);

    expect(result).toMatchObject({ ok: false, account_kind: 'account' });
    expect(result.error).toContain('api_key');
  });

  it('says to sign in when claude reports no login', async () => {
    const result = await rig({ status: JSON.stringify({ loggedIn: false }) }).test(login);

    expect(result.ok).toBe(false);
    expect(result.error).toContain('not logged in');
  });

  it('a missing install is a failed result with the install pointer and no process', async () => {
    const r = rig({});
    const result = await r.test({ id: 'claude', authMode: 'login' }, false, {
      fileExists: () => false,
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain('https://code.claude.com/docs/en/setup');
    expect(r.calls).toHaveLength(0);
  });

  it('a harness set to api_key with no stored secret is a failed result, not a spawn', async () => {
    const r = rig({ status: ACCOUNT });
    const result = await r.test({ id: 'other', binaryPath: CLAUDE, authMode: 'api_key' });

    expect(result.ok).toBe(false);
    expect(result.error).toContain('Settings');
    expect(r.calls).toHaveLength(0);
  });

  it('an executable that prints no version is a failed result', async () => {
    const result = await rig({ version: null }).test(login);

    expect(result).toMatchObject({ ok: false, binary_path: CLAUDE });
  });

  it('makes the one-word live call only when asked, with the prompt on stdin', async () => {
    const r = rig({
      status: ACCOUNT,
      live: JSON.stringify({ type: 'result', is_error: false, result: 'pong' }),
    });

    const result = await r.test(login, true);
    const live = r.calls.find((c) => c.args.includes('-p'));

    expect(result).toMatchObject({ ok: true, live: 'ok' });
    expect(live?.child.written()).toBe('Reply with the single word: pong');
    expect(live?.args).toContain('--max-budget-usd');
  });

  it('reports a failed live call', async () => {
    const result = await rig({
      status: ACCOUNT,
      live: JSON.stringify({ type: 'result', is_error: true }),
    }).test(login, true);

    expect(result).toMatchObject({ ok: false, live: 'failed' });
  });
});
