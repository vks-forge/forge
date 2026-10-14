/**
 * Pins: how the ACP engine starts the adapter: env, auth wait, session options, mode, load.
 *
 * Why: the Worker runs with whatever the host's settings allow unless the driver closes the
 * gaps itself. A leaked `CLAUDECODE` stops the harness from starting, a missing auth wait
 * hides a logged-out host as a stall, a wrong `_meta.claudeCode.options` lets the adapter
 * read user settings or bypass permissions, and a skipped `set_mode default` lets the
 * user's `acceptEdits` approve writes with no hook decision (probes 3 and 5, d-0049).
 *
 * Depends on: helpers/claude-rigs, helpers/fake-acp-agent.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RequestError } from '@agentclientprotocol/sdk';
import { describe, expect, it } from 'vitest';
import { createClaudeDriver } from '#/adapters/claude/claude-driver.js';
import { HarnessNotInstalledError } from '#/shared/errors.js';
import { makeAcpRig } from '#tests/helpers/claude-rigs.js';
import { TEST_CLAUDE } from '#tests/helpers/rig-base.js';

const sessionNew = (rig: ReturnType<typeof makeAcpRig>) =>
  rig.agents[0]?.paramsOf('session/new')[0] as Record<string, unknown>;

describe('ACP engine: process and environment (rule 1)', () => {
  it('spawns node on the pinned adapter entry without a shell, in the run dir', async () => {
    const rig = makeAcpRig();
    const h = await rig.driver.start(rig.request());
    await rig.driver.result(h);
    const call = rig.spawns[0];
    expect(call?.command).toBe(process.execPath);
    expect(call?.args).toEqual(['/acp/dist/index.js']);
    expect(call?.options.cwd).toBe(join(rig.runsRoot, 'run-1'));
  });

  it('merges host, request and prepared env and strips the nesting variables', async () => {
    const rig = makeAcpRig();
    await rig.driver.result(await rig.driver.start(rig.request()));
    const env = rig.spawns[0]?.options.env ?? {};
    expect(env['CLAUDE_CONFIG_DIR']).toBe('/kept');
    expect(env).not.toHaveProperty('ANTHROPIC_API_KEY');
    expect(env).not.toHaveProperty('FORGE_CATALOGUE_KEY');
    expect(env['FORGE_TICKET']).toBe('FG-1');
    expect(env['FORGE_RUN_ID']).toBe('run-1');
    for (const k of ['CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT', 'FORGE_HOOK_CONFIG']) {
      expect(env).not.toHaveProperty(k);
    }
  });

  it("points the adapter at the user's installed claude with forward slashes (d-0101)", async () => {
    const rig = makeAcpRig();
    await rig.driver.result(await rig.driver.start(rig.request()));
    expect(rig.spawns[0]?.options.env?.['CLAUDE_CODE_EXECUTABLE']).toBe(TEST_CLAUDE);

    const win = makeAcpRig({}, undefined, 'win32');
    const driver = createClaudeDriver({
      ...win.deps,
      harness: () => ({
        id: 'claude',
        binaryPath: String.raw`C:\Users\me\.local\bin\claude.exe`,
        authMode: 'login',
      }),
    });

    await driver.result(await driver.start(win.request()));
    expect(win.spawns[0]?.options.env?.['CLAUDE_CODE_EXECUTABLE']).toBe(
      'C:/Users/me/.local/bin/claude.exe',
    );
  });

  it('fails closed when claude is not installed: typed error, nothing spawned', async () => {
    const rig = makeAcpRig();
    const driver = createClaudeDriver({
      ...rig.deps,
      harness: () => ({ id: 'claude', authMode: 'login' }),
      fileExists: () => false,
      baseEnv: { PATH: '/nowhere' },
    });

    const failure = await driver.start(rig.request()).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(HarnessNotInstalledError);
    expect((failure as Error).message).toContain(
      'Install Claude Code: https://code.claude.com/docs/en/setup',
    );

    expect(rig.spawns).toHaveLength(0);
  });
});

describe('ACP engine: auth (rule 2)', () => {
  it('initializes, then starts the session once an account is reported', async () => {
    const rig = makeAcpRig();
    await rig.driver.result(await rig.driver.start(rig.request()));
    expect(rig.agents[0]?.methods().slice(0, 2)).toEqual(['initialize', 'session/new']);
  });

  it('ends as auth when the adapter reports no login', async () => {
    const rig = makeAcpRig();
    rig.next = { auth: 'none' };
    const result = await rig.driver.result(await rig.driver.start(rig.request()));
    expect(result).toMatchObject({ status: 'error', errorFamily: 'auth' });
    expect(rig.agents[0]?.methods()).not.toContain('session/new');
  });

  it('ends as auth when no account report arrives within the timeout', async () => {
    const rig = makeAcpRig({ authTimeoutMs: 1_000 });
    rig.next = { auth: 'silent' };
    const handle = await rig.driver.start(rig.request());
    await rig.clock.advance(1_000);
    expect(await rig.driver.result(handle)).toMatchObject({
      status: 'error',
      errorFamily: 'auth',
    });
  });

  it('classifies an authRequired prompt rejection as auth', async () => {
    const rig = makeAcpRig();
    rig.next = { onPrompt: async () => RequestError.authRequired() };
    const r = await rig.driver.result(await rig.driver.start(rig.request()));
    expect(r.errorFamily).toBe('auth');
  });
});

describe('ACP engine: session options and mode (rules 3 and 4)', () => {
  it('sends the d-0035 options, the MCP servers and the settings path', async () => {
    const rig = makeAcpRig();
    const req = rig.request({ model: 'haiku' });
    await rig.driver.result(await rig.driver.start(req));
    const p = sessionNew(rig);
    const settingsPath = join(rig.runsRoot, 'run-1', 'settings.json');
    expect(p).toMatchObject({
      cwd: req.cwd,
      mcpServers: [
        {
          name: 'forge',
          command: 'node',
          args: ['mcp.js'],
          env: [{ name: 'FORGE_RUN_TOKEN', value: 't' }],
        },
      ],
      _meta: {
        claudeCode: {
          options: {
            settingSources: [],
            strictMcpConfig: true,
            allowDangerouslySkipPermissions: false,
            maxTurns: 5,
            maxBudgetUsd: 0.05,
            model: 'haiku',
            settings: settingsPath,
            env: { ENABLE_TOOL_SEARCH: 'false' },
          },
        },
      },
    });

    const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
    expect(settings.hooks.PreToolUse[0].hooks[0]).toMatchObject({
      onFailure: 'block',
      type: 'command',
    });

    const hook = JSON.parse(
      readFileSync(join(rig.runsRoot, 'run-1', 'hook.json'), 'utf8'),
    );

    expect(hook).toMatchObject({
      run_id: 'run-1',
      token: 'bearer-token',
      server_url: 'http://127.0.0.1:9',
    });
  });

  it('sets mode default immediately after session/new and before the first prompt', async () => {
    const rig = makeAcpRig();
    await rig.driver.result(await rig.driver.start(rig.request()));
    const m = rig.agents[0]?.methods() ?? [];
    expect(m.indexOf('session/set_mode')).toBe(m.indexOf('session/new') + 1);
    expect(m.indexOf('session/prompt')).toBeGreaterThan(m.indexOf('session/set_mode'));
    expect(rig.agents[0]?.paramsOf('session/set_mode')[0]).toMatchObject({
      modeId: 'default',
    });
  });

  it('loads on resume, with the same options, and sets mode default after the load', async () => {
    const rig = makeAcpRig();
    await rig.driver.result(await rig.driver.start(rig.request({ resume: 'old-sess' })));
    const a = rig.agents[0];
    expect(a?.methods()).not.toContain('session/new');
    const m = a?.methods() ?? [];
    expect(m.indexOf('session/set_mode')).toBe(m.indexOf('session/load') + 1);
    expect(a?.paramsOf('session/load')[0]).toMatchObject({
      sessionId: 'old-sess',
      _meta: { claudeCode: { options: { allowDangerouslySkipPermissions: false } } },
    });
  });

  it('aborts as policy_denied and never prompts when set_mode fails', async () => {
    const rig = makeAcpRig();
    rig.next = { auth: 'account', failSetMode: true };
    const r = await rig.driver.result(await rig.driver.start(rig.request()));
    expect(r).toMatchObject({ status: 'error', errorFamily: 'policy_denied' });
    expect(rig.agents[0]?.methods()).not.toContain('session/prompt');
  });

  it('logs which of the four settings files exist', async () => {
    const rig = makeAcpRig();
    await rig.driver.result(await rig.driver.start(rig.request()));
    const entry = rig.logs.find((l) => l.message.includes('settings sources'));
    expect(entry).toBeDefined();
    expect(entry?.fields).toMatchObject({ checked: expect.any(Array), existing: [] });
  });
});

describe('ACP engine: preflight (d-0087, d-0088)', () => {
  it('reports the adapter version and the installed claude version, run from the installed path', async () => {
    const rig = makeAcpRig();
    const p = await rig.driver.preflight();
    expect(p).toEqual({
      ok: true,
      issues: [],
      version: 'acp 0.89.1; claude-code 2.1.299',
      harnessVersion: '2.1.299',
    });

    const probe = rig.spawns.find((s) => s.command === TEST_CLAUDE);
    expect(probe?.args).toEqual(['--version']);
  });

  it('flags an adapter that differs from its pin, but not a different installed claude', async () => {
    const rig = makeAcpRig({ pinnedAdapterVersion: '9.9.9' });
    const p = await rig.driver.preflight();
    expect(p.ok).toBe(false);
    expect(p.issues.join(' ')).toContain('9.9.9');
    expect(p.issues.join(' ')).not.toContain('claude');
  });

  it('reports a missing install with the install pointer and spawns nothing', async () => {
    const rig = makeAcpRig();
    const driver = createClaudeDriver({
      ...rig.deps,
      harness: () => ({ id: 'claude', authMode: 'login' }),
      fileExists: () => false,
      baseEnv: { PATH: '/nowhere' },
    });

    const p = await driver.preflight();
    expect(p.ok).toBe(false);
    expect(p.issues.join(' ')).toContain('https://code.claude.com/docs/en/setup');
    expect(rig.spawns).toHaveLength(0);
  });
});
