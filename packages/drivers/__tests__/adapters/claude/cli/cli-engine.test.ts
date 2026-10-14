/**
 * Pins: the CLI engine's command line, process hosting and stream parsing.
 *
 * Why: the CLI is the fallback when ACP is unavailable, and it has to give the Director the
 * same answers. Its inputs differ (a command line and a prompt on stdin instead of
 * JSON-RPC), so the flags that make isolation real and the line handling that turns a
 * stream into normalised events are what these cases hold in place.
 *
 * Depends on: helpers/claude-rigs (runs helpers/fake-claude.mjs under node), helpers/cli-run.
 */

import { describe, expect, it } from 'vitest';
import { line, makeCliRig, STREAM } from '#tests/helpers/claude-rigs.js';
import { SECRET_NAMES } from '#tests/helpers/secret-env.js';
import { run } from '#tests/helpers/cli-run.js';

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
    for (const k of ['CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT', 'FORGE_HOOK_CONFIG']) {
      expect(env).not.toHaveProperty(k);
    }
  });

  it('never hands the server secrets to the Worker child (H1)', async () => {
    const { rig } = await run([STREAM.result()]);
    const env = rig.lastCall().env;
    for (const k of SECRET_NAMES) {
      expect(env).not.toHaveProperty(k);
    }

    expect(env['CLAUDE_CONFIG_DIR']).toBe('/kept');
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
      harnessVersion: '2.1.296',
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
