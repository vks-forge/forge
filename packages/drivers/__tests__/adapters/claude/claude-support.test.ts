/**
 * Pins: process-tree kill, version probe, run files, settings sources, git port, driver
 * input validation and the engine-factory seam.
 *
 * Why: these are the pieces that touch the OS: killing a whole tree on both platform
 * families, writing the files the hook reads, asking git what changed. They fail quietly
 * (an orphan process, a hook with no token, an empty file list), so each is pinned.
 *
 * Depends on: src/adapters/claude/*, helpers/fake-child, helpers/fake-clock.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createClaudeDriver } from '#/adapters/claude/claude-driver.js';
import { createGitCli } from '#/adapters/claude/git-cli.js';
import { killTree } from '#/adapters/claude/process-tree.js';
import { writeRunFiles } from '#/adapters/claude/run-files.js';
import {
  existingSettingsSources,
  settingsSourcePaths,
} from '#/adapters/claude/settings-sources.js';
import { nodeSpawn, systemClock } from '#/adapters/claude/system.js';
import { probeVersion } from '#/adapters/claude/version-probe.js';
import { makeAcpRig } from '#tests/helpers/claude-rigs.js';
import { createFakeChild, recordingSpawn } from '#tests/helpers/fake-child.js';
import { createFakeClock } from '#tests/helpers/fake-clock.js';
import { makePrepareRun, makeRequest, tempDir } from '#tests/helpers/run-request.js';

describe('killTree', () => {
  it('uses taskkill /T /F on Windows and then the child itself', async () => {
    const child = createFakeChild(77);
    const { spawn, calls } = recordingSpawn(() => {
      const k = createFakeChild(undefined);
      setImmediate(() => k.exit(0));

      return k;
    });

    await killTree(child, { platform: 'win32', spawn });
    expect(calls[0]).toMatchObject({
      command: 'taskkill',
      args: ['/T', '/F', '/PID', '77'],
    });

    expect(child.kills).toEqual(['SIGKILL']);
  });

  it('signals the process group on POSIX and falls back to the child', async () => {
    const child = createFakeChild(78);
    const sent: number[] = [];
    await killTree(child, {
      platform: 'linux',
      spawn: nodeSpawn,
      signalGroup: (p) => void sent.push(p),
    });

    expect(sent).toEqual([78]);
    await killTree(child, {
      platform: 'linux',
      spawn: nodeSpawn,
      signalGroup: () => {
        throw new Error('ESRCH');
      },
    });

    expect(child.kills).toEqual(['SIGKILL']);
    const noPid = createFakeChild(undefined);
    await killTree(noPid, { platform: 'linux', spawn: nodeSpawn });
    expect(noPid.kills).toEqual(['SIGKILL']);
  });
});

describe('probeVersion', () => {
  it('returns the printed version, or null for a missing binary or a hang', async () => {
    const ok = createFakeChild();
    ok.stdoutPipe.write('Claude Code 1.2.3\n');
    ok.exit(0);
    expect(await probeVersion(() => ok, systemClock, 'x', [], {})).toBe('1.2.3');
    const missing = () => {
      throw new Error('ENOENT');
    };

    expect(await probeVersion(missing, systemClock, 'x', [], {})).toBeNull();
    const clock = createFakeClock();
    const hang = createFakeChild();
    const p = probeVersion(() => hang, clock, 'x', [], {});
    await clock.advance(15_000);
    expect(await p).toBeNull();
  });
});

describe('run files and settings sources', () => {
  it('writes hook.json, settings.json and mcp.json under the run dir', async () => {
    const root = tempDir();
    const req = makeRequest();
    const prepared = await makePrepareRun(root)(req);
    const files = await writeRunFiles(req.runId, prepared, '/h/hook.js');
    expect(
      JSON.parse(readFileSync(files.mcpConfigPath, 'utf8')).mcpServers.forge.command,
    ).toBe('node');

    expect(readFileSync(files.settingsPath, 'utf8')).toContain('/h/hook.js');
    await expect(
      writeRunFiles(req.runId, { ...prepared, hookServerUrl: 'nope' }, '/h/hook.js'),
    ).rejects.toThrow();
  });

  it('lists the four sources and reports the ones that exist', async () => {
    const cwd = tempDir();
    mkdirSync(join(cwd, '.claude'));
    writeFileSync(join(cwd, '.claude', 'settings.json'), '{}');
    const paths = settingsSourcePaths(cwd, tempDir(), 'win32');
    expect(paths).toHaveLength(4);
    expect(await existingSettingsSources(paths)).toEqual([
      join(cwd, '.claude', 'settings.json'),
    ]);

    expect(settingsSourcePaths(cwd, '/h', 'freebsd' as NodeJS.Platform)).toHaveLength(3);
  });
});

// 30s: six real git child processes, slow on Windows while the full suite runs in parallel.
describe('git port', { timeout: 30_000 }, () => {
  it('lists tracked changes since the base and untracked files', async () => {
    const dir = tempDir();
    const git = (...a: string[]) => execFileSync('git', a, { cwd: dir, stdio: 'pipe' });
    git('init', '-q');
    git('config', 'user.email', 't@t');
    git('config', 'user.name', 't');
    writeFileSync(join(dir, 'a.txt'), '1');
    git('add', '.');
    git('commit', '-qm', 'one');
    const port = createGitCli();
    const base = await port.head(dir);
    writeFileSync(join(dir, 'a.txt'), '2');
    writeFileSync(join(dir, 'new file.txt'), 'n');
    expect(await port.changedFiles(dir, base)).toEqual(['a.txt', 'new file.txt']);
    await expect(port.head(tempDir())).rejects.toThrow();
  });
});

describe('driver input and seams', () => {
  it('rejects an invalid request and a run that is still active', async () => {
    const rig = makeAcpRig();
    await expect(rig.driver.start({ runId: '' } as never)).rejects.toMatchObject({
      errorFamily: 'invalid_input',
    });

    rig.scriptHang();
    const h = await rig.driver.start(rig.request());
    await expect(rig.driver.start(rig.request())).rejects.toMatchObject({
      errorFamily: 'invalid_input',
    });

    await expect(rig.driver.resume(h)).rejects.toMatchObject({
      errorFamily: 'invalid_input',
    });

    await rig.driver.cancel(h);
    await rig.driver.result(h);
    await expect(rig.driver.resume({ runId: 'ghost' })).rejects.toBeDefined();
  });

  it('uses an injected engine factory and reports a launch failure as a crash', async () => {
    const rig = makeAcpRig();
    const driver = createClaudeDriver({
      ...rig.deps,
      engineFactories: {
        acp: () => ({
          kind: 'acp',
          capabilities: () => ({
            resume: false,
            steerModes: [],
            nativeSandbox: false,
            reportsCost: false,
            structuredOutput: false,
            permissionRequests: false,
          }),
          preflight: async () => ({ ok: true, issues: [] }),
          launch: () => {
            throw new Error('no engine');
          },
        }),
      },
    });

    const h = await driver.start(rig.request());
    expect(await driver.result(h)).toMatchObject({
      status: 'error',
      errorFamily: 'crash',
    });

    await expect(driver.steer(h, 'x', 'steer')).rejects.toMatchObject({
      errorFamily: 'invalid_input',
    });
  });

  it('reports a spawn that throws as a crash and a silent adapter as a preflight issue', async () => {
    const rig = makeAcpRig();
    const driver = createClaudeDriver({
      ...rig.deps,
      spawn: () => {
        throw new Error('EACCES');
      },
    });

    const done = await driver.result(await driver.start(rig.request()));
    expect(done.errorFamily).toBe('crash');
    expect((await driver.preflight()).ok).toBe(false);
  });
});
