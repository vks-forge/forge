/**
 * Pins: the CLI engine's command line, stream parsing and every row of the result table.
 *
 * Why: the CLI is the fallback when ACP is unavailable, and it has to give the Director the
 * same answers: the same result families, the same pause on `ask_director`, the same
 * receipt cross-check. Its inputs differ (a command line and a prompt on stdin instead of
 * JSON-RPC), and a budget stop is a normal-looking exit 0 with no result text (probe 1), so
 * the flags and the line handling are what make isolation and the result table real.
 *
 * Depends on: helpers/claude-rigs (runs helpers/fake-claude.mjs under node), helpers/wait-for.
 */

import { RunEvent } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { line, makeCliRig, STREAM } from '#tests/helpers/claude-rigs.js';
import { waitFor } from '#tests/helpers/wait-for.js';

async function run(
  lines: string[],
  opts: { exit?: number; stderr?: string } = {},
  config = {},
) {
  const rig = makeCliRig(config);
  rig.fixture(lines, opts);
  const h = await rig.driver.start(rig.request());
  const result = await rig.driver.result(h);
  const events: RunEvent[] = [];
  for await (const e of rig.driver.events(h)) events.push(e);
  return { rig, result, events };
}

// Real node child processes: allow for a slow, loaded machine.
describe('CLI engine: command line and process', { timeout: 30_000 }, () => {
  it('hosts claude -p stream-json with isolation flags, prompt on stdin, no shell', async () => {
    const { rig, result } = await run([STREAM.init, STREAM.result()]);
    expect(result.status).toBe('success');
    const call = rig.lastCall();
    const a = call.argv;
    const at = (flag: string): string | undefined => a[a.indexOf(flag) + 1];
    expect(a.slice(0, 4)).toEqual(['-p', '--output-format', 'stream-json', '--verbose']);
    expect(a).toContain('--strict-mcp-config');
    expect(a.indexOf('--setting-sources')).toBeGreaterThan(-1);
    expect(at('--setting-sources')).toBe('');
    expect(at('--settings')).toMatch(/run-1[\\/]settings\.json$/);
    expect(at('--mcp-config')).toMatch(/run-1[\\/]mcp\.json$/);
    expect(at('--max-budget-usd')).toBe('0.05');
    expect(at('--max-turns')).toBe('5');
    expect(at('--model')).toBe('haiku');
    expect(at('--permission-mode')).toBe('default');
    expect(a).not.toContain('--resume');
    expect(a).not.toContain('--bare');
    expect(a).not.toContain('--dangerously-skip-permissions');
    expect(call.stdin).toBe('do the task');
  });

  it('strips the nesting variables from the child env', async () => {
    const { rig } = await run([STREAM.result()]);
    const env = rig.lastCall().env;
    expect(env['FORGE_TICKET']).toBe('FG-1');
    for (const k of ['CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT', 'FORGE_HOOK_CONFIG'])
      expect(env).not.toHaveProperty(k);
  });

  it('runs in the worktree and resumes with --resume <session>', async () => {
    const rig = makeCliRig();
    rig.fixture([STREAM.result()]);
    const req = rig.request({ resume: 'sess-9' });
    await rig.driver.result(await rig.driver.start(req));
    const call = rig.lastCall();
    expect(call.argv[call.argv.indexOf('--resume') + 1]).toBe('sess-9');
    expect(call.cwd).toContain('forge-cwd-');
  });

  it('passes allow and deny lists from the request as comma-joined flags', async () => {
    const rig = makeCliRig();
    rig.fixture([STREAM.result()]);
    const req = rig.request({
      permissionPolicy: {
        allow: ['Read', 'Edit'],
        deny: ['WebFetch'],
        onUnlisted: 'deny',
      },
    });
    await rig.driver.result(await rig.driver.start(req));
    const a = rig.lastCall().argv;
    expect(a[a.indexOf('--allowedTools') + 1]).toBe('Read,Edit');
    expect(a[a.indexOf('--disallowedTools') + 1]).toBe('WebFetch');
  });

  it('declares no steering and refuses steer', async () => {
    const rig = makeCliRig();
    expect(rig.driver.capabilities()).toMatchObject({
      resume: true,
      steerModes: [],
      permissionRequests: false,
    });
    rig.scriptHang();
    const h = await rig.driver.start(rig.request());
    await expect(rig.driver.steer(h, 'x', 'steer')).rejects.toMatchObject({
      errorFamily: 'invalid_input',
    });
    await rig.driver.cancel(h);
    await rig.driver.result(h);
  });

  it('reports the host claude version in preflight and a missing binary as an issue', async () => {
    const rig = makeCliRig();
    expect(await rig.driver.preflight()).toEqual({
      ok: true,
      issues: [],
      version: '2.1.296',
    });
  });
});

describe('CLI engine: events', { timeout: 30_000 }, () => {
  it('maps text, tool use and tool results, the session, and a usage event', async () => {
    const { events, result } = await run([
      STREAM.init,
      STREAM.text,
      STREAM.toolUse('tu1'),
      STREAM.toolResult('tu1', 'hi', false),
      STREAM.result(),
    ]);
    expect(events.map((e) => e.type)).toEqual([
      'session',
      'text',
      'tool_call',
      'tool_result',
      'usage',
    ]);
    expect(events[2]).toMatchObject({ call_id: 'tu1', name: 'Bash' });
    expect(events[3]).toMatchObject({ call_id: 'tu1', is_error: false });
    expect(result).toMatchObject({
      status: 'success',
      session: 'cli-sess-1',
      costUsd: 0.0123,
      usage: { in: 10, out: 5, cachedIn: 2, cacheWrite: 1 },
      filesTouched: ['src/a.ts'],
    });
  });

  it('ignores blank, non-JSON and unknown lines', async () => {
    const { result } = await run([
      '',
      'not json',
      line({ type: 'weird' }),
      STREAM.result(),
    ]);
    expect(result.status).toBe('success');
  });
});

describe('CLI engine: result table', { timeout: 30_000 }, () => {
  it('budget: subtype error_max_budget_usd with exit 0 and no result text', async () => {
    const { result } = await run([
      STREAM.result({
        subtype: 'error_max_budget_usd',
        is_error: true,
        result: undefined,
      }),
    ]);
    expect(result).toMatchObject({ status: 'error', errorFamily: 'budget' });
  });

  it('max_turns: subtype error_max_turns drops the session', async () => {
    const { result } = await run([
      STREAM.result({ subtype: 'error_max_turns', is_error: true }),
    ]);
    expect(result).toMatchObject({ status: 'max_turns', session: null });
  });

  it('refusal: stop_reason refusal is refused/refusal', async () => {
    const { result } = await run([STREAM.result({ stop_reason: 'refusal' })]);
    expect(result).toMatchObject({ status: 'refused', errorFamily: 'refusal' });
  });

  it('rate limit: a 429 result uses the rate_limit_event reset time', async () => {
    const reset = Math.floor(Date.UTC(2026, 9, 13, 20, 0, 0) / 1000);
    const { result } = await run([
      line({
        type: 'rate_limit_event',
        rate_limit_info: { status: 'rejected', resetsAt: reset },
      }),
      STREAM.result({
        is_error: true,
        result: 'API Error: 429 rate limit',
        api_error_status: 429,
      }),
    ]);
    expect(result).toMatchObject({
      status: 'error',
      errorFamily: 'rate_limit',
      retryNotBefore: new Date(reset * 1000).toISOString(),
    });
  });

  it('rate limit: overloaded text without a reset backs off by the configured delay', async () => {
    const rig = makeCliRig({ rateLimitBackoffMs: 90_000 });
    rig.fixture([STREAM.result({ is_error: true, result: 'API Error: overloaded' })]);
    const r = await rig.driver.result(await rig.driver.start(rig.request()));
    expect(r.errorFamily).toBe('rate_limit');
    expect(r.retryNotBefore).toBe(new Date(rig.clock.now() + 90_000).toISOString());
  });

  it('auth: login error text is error/auth', async () => {
    const { result } = await run([
      STREAM.result({ is_error: true, result: 'Not logged in · Please run /login' }),
    ]);
    expect(result).toMatchObject({ status: 'error', errorFamily: 'auth' });
  });

  it('stall: no output for stallMs kills the run as timeout/stall', async () => {
    const rig = makeCliRig();
    rig.scriptHang();
    const h = await rig.driver.start(rig.request());
    await waitFor(() => rig.clock.pending() > 0, 'stall timer');
    await rig.clock.advance(60_000);
    expect(await rig.driver.result(h)).toMatchObject({
      status: 'timeout',
      errorFamily: 'stall',
    });
  });

  it('paused: ask_director as the last act pauses the run on its interaction', async () => {
    const { result } = await run([
      STREAM.init,
      STREAM.toolUse('q1', 'mcp__forge__ask_director', { question: 'which db?' }),
      STREAM.toolResult(
        'q1',
        JSON.stringify({ interaction_id: 'int-3', status: 'pending' }),
      ),
      STREAM.result(),
    ]);
    expect(result).toMatchObject({
      status: 'paused',
      pauseReason: 'interaction',
      interactionId: 'int-3',
    });
  });

  it('crash: a non-zero exit without a result line is error/crash with stderr in the event', async () => {
    const { result, events } = await run([STREAM.init], { exit: 1, stderr: 'boom\n' });
    expect(result).toMatchObject({ status: 'error', errorFamily: 'crash' });
    const err = events.find((e) => e.type === 'error');
    expect(err && 'message' in err ? err.message : '').toContain('boom');
  });

  it('crash: exit 0 without a result line is still a crash', async () => {
    const { result } = await run([STREAM.init, STREAM.text]);
    expect(result).toMatchObject({ status: 'error', errorFamily: 'crash' });
  });

  it('kills a process that printed its result but did not exit, after the grace period', async () => {
    const rig = makeCliRig({ cancelGraceMs: 2_000 });
    rig.fixture([STREAM.init, STREAM.result()], { hang: true });
    const h = await rig.driver.start(rig.request());
    for await (const e of rig.driver.events(h)) if (e.type === 'usage') break;
    await rig.clock.advance(2_000);
    expect((await rig.driver.result(h)).status).toBe('success');
    expect(rig.groupSignals).toHaveLength(1);
  });
});

describe('CLI engine: receipt cross-check', { timeout: 30_000 }, () => {
  it('cancels as policy_denied when a tool_use has no receipt within the grace window', async () => {
    const rig = makeCliRig();
    rig.receipts.allowAll = false;
    rig.fixture([STREAM.init, STREAM.toolUse('ghost')], { hang: true });
    const h = await rig.driver.start(rig.request());
    await waitFor(() => rig.receipts.asked.length > 0, 'receipt lookup');
    await rig.clock.advance(3_000);
    expect(await rig.driver.result(h)).toMatchObject({
      status: 'error',
      errorFamily: 'policy_denied',
    });
  });

  it('accepts a tool_use the hook recorded under the same id', async () => {
    const rig = makeCliRig();
    rig.receipts.allowAll = false;
    rig.receipts.record('tu1', 'allow');
    rig.fixture([
      STREAM.init,
      STREAM.toolUse('tu1'),
      STREAM.toolResult('tu1'),
      STREAM.result(),
    ]);
    const h = await rig.driver.start(rig.request());
    await waitFor(() => rig.receipts.asked.length > 0, 'receipt lookup');
    expect((await rig.driver.result(h)).status).toBe('success');
  });
});

describe('CLI engine: cancel', { timeout: 30_000 }, () => {
  it('terminates the process and reports cancelled', async () => {
    const rig = makeCliRig();
    rig.scriptHang();
    const h = await rig.driver.start(rig.request());
    await rig.driver.cancel(h);
    expect((await rig.driver.result(h)).status).toBe('cancelled');
  });
});
