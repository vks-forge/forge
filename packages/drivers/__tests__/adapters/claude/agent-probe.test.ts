/**
 * Pins: the tool-less probe behind "Test agent", and the models the Claude driver declares.
 *
 * Why: the owner presses Test agent to see an agent answer with its own model and instructions
 *   before trusting it with a ticket. The call must be unable to do harm (no tools, no settings,
 *   no saved session) and cheap (a dollar cap from the request), must send the model only when
 *   the agent names one (an agent on "harness default" must not force a model), and every way it
 *   can end must come back as a value with an error family the screen can explain: never a
 *   throw, never the credential.
 *
 * Pins: the argument list; no --model when absent; instructions as the system prompt; the prompt
 *   on stdin; reply, cost and model from a good answer; auth, quota, budget, crash and stall
 *   families; the credential reaches the child env only; claude models are declared and valid.
 * Depends on: src/adapters/claude/agent-probe, src/domain/claude-models, helpers/fake-child,
 *   helpers/fake-clock. No real processes.
 */

import { HarnessModel } from '@forge/core';
import type { SecretStore } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { probeArgs, probeClaude } from '#/adapters/claude/agent-probe.js';
import { createHarnessResolver } from '#/adapters/claude/harness-resolver.js';
import { CLAUDE_MODELS } from '#/domain/claude-models.js';
import { createFakeChild, recordingSpawn } from '#tests/helpers/fake-child.js';
import { createFakeClock } from '#tests/helpers/fake-clock.js';

const CLAUDE = '/forge/test/bin/claude';
const KEY = 'sk-ant-api03-NEVER-IN-THE-ANSWER';

const REQ = {
  instructions: 'Rule one: be brief.',
  prompt: 'Say hello.',
  timeoutMs: 60_000,
  maxUsd: 0.1,
};

const result = (o: Record<string, unknown>): string =>
  JSON.stringify([
    {
      type: 'result',
      subtype: 'success',
      is_error: false,
      result: 'I am a reviewer. Rule one: be brief.',
      total_cost_usd: 0.012,
      modelUsage: { 'claude-sonnet-5-5': { inputTokens: 5, outputTokens: 7 } },
      ...o,
    },
  ]);

function rig(stdout: string | null, authMode: 'login' | 'api_key' = 'login') {
  const clock = createFakeClock();
  const { spawn, calls } = recordingSpawn(() => {
    const child = createFakeChild();
    if (stdout === null) {
      return child; // never answers: the deadline decides
    }

    child.stdoutPipe.end(stdout);
    child.exit(0);

    return child;
  });

  const secrets: SecretStore = {
    get: async (name) =>
      name === 'harness/claude/api-key' ? new TextEncoder().encode(KEY) : null,
    put: async () => undefined,
    delete: async () => undefined,
    list: async () => [],
  };

  const resolver = createHarnessResolver({
    platform: 'linux',
    env: { PATH: '/usr/bin' },
    exists: () => true,
    defaultBinary: CLAUDE,
    source: () => ({ id: 'claude', binaryPath: CLAUDE, authMode }),
    secrets,
  });

  const deps = { spawn, clock, resolver, baseEnv: { PATH: '/usr/bin' } };

  return { calls, clock, run: (req = REQ) => probeClaude(deps, req) };
}

describe('probeArgs', () => {
  it('is tool-less, settings-less and session-less, with the dollar cap of the request', () => {
    const args = probeArgs({ ...REQ, model: 'haiku' });

    expect(args).toEqual(
      expect.arrayContaining([
        '-p',
        '--output-format',
        'json',
        '--no-session-persistence',
        '--max-budget-usd',
        '0.1',
      ]),
    );

    expect(args[args.indexOf('--tools') + 1]).toBe('');
    expect(args[args.indexOf('--setting-sources') + 1]).toBe('');
    expect(args[args.indexOf('--model') + 1]).toBe('haiku');
    expect(args[args.indexOf('--append-system-prompt') + 1]).toBe('Rule one: be brief.');
  });

  it('sends no model when the agent follows the harness default, and no system prompt for empty instructions', () => {
    const args = probeArgs({ ...REQ, instructions: '  ' });

    expect(args).not.toContain('--model');
    expect(args).not.toContain('--append-system-prompt');
  });
});

describe('probeClaude', () => {
  it('returns the reply, the model used and the cost of a good answer, with the prompt on stdin', async () => {
    const r = rig(result({}));
    const out = await r.run();

    expect(out).toMatchObject({
      ok: true,
      reply: 'I am a reviewer. Rule one: be brief.',
      costUsd: 0.012,
      modelUsed: 'claude-sonnet-5-5',
    });

    expect(r.calls[0]?.command).toBe(CLAUDE);
    expect(r.calls[0]?.child.written()).toBe('Say hello.');
  });

  it('classifies a quota answer, an auth answer and a budget stop by family', async () => {
    const quota = await rig(
      result({
        is_error: true,
        subtype: 'error_during_execution',
        result: 'The Claude account has no available quota.',
      }),
    ).run();

    const auth = await rig(
      result({
        is_error: true,
        subtype: 'error_during_execution',
        result: 'Please run /login',
        api_error_status: 401,
      }),
    ).run();

    const budget = await rig(
      result({ is_error: true, subtype: 'error_max_budget_usd', result: undefined }),
    ).run();

    expect(quota.error?.family).toBe('quota');
    expect(auth.error?.family).toBe('auth');
    expect(budget.error?.family).toBe('budget');
    expect([quota.ok, auth.ok, budget.ok]).toEqual([false, false, false]);
  });

  it('reports an answer with no result line as a crash', async () => {
    const out = await rig('not json at all').run();

    expect(out).toMatchObject({ ok: false, error: { family: 'crash' } });
  });

  it('reports a call that outlives its deadline as a stall', async () => {
    const r = rig(null);
    const pending = r.run({ ...REQ, timeoutMs: 1_000 });
    await Promise.resolve();
    await Promise.resolve();
    await r.clock.advance(1_000);

    expect(await pending).toMatchObject({ ok: false, error: { family: 'stall' } });
  });

  it('puts the stored credential in the child environment only, never in the result', async () => {
    const r = rig(result({}), 'api_key');
    const out = await r.run();

    expect(r.calls[0]?.options.env?.['ANTHROPIC_API_KEY']).toBe(KEY);
    expect(JSON.stringify(out)).not.toContain(KEY);
  });

  it('reports a harness that cannot be resolved as a failed result, not a throw', async () => {
    const clock = createFakeClock();
    const resolver = createHarnessResolver({
      platform: 'linux',
      env: { PATH: '/usr/bin' },
      exists: () => false,
      defaultBinary: 'claude',
      source: () => ({ id: 'claude', authMode: 'login' }),
    });

    const out = await probeClaude(
      {
        spawn: recordingSpawn(() => createFakeChild()).spawn,
        clock,
        resolver,
        baseEnv: {},
      },
      REQ,
    );

    expect(out.ok).toBe(false);
    expect(out.error?.message.length).toBeGreaterThan(0);
  });
});

describe('CLAUDE_MODELS', () => {
  it('declares opus, sonnet and haiku as valid entries with a recommendation for every role it suits', () => {
    expect(CLAUDE_MODELS.map((m) => m.id)).toEqual(['opus', 'sonnet', 'haiku']);

    for (const m of CLAUDE_MODELS) {
      expect(HarnessModel.parse(m)).toEqual(m);
    }
  });
});
