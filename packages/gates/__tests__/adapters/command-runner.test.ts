/**
 * Command runner tests — pin the real spawner against tiny node programs.
 *
 * Why: G1 trusts this adapter for the exit code and for not hanging the server. A runner
 *   that lost the exit code, ignored the timeout or left a child tree running would
 *   either pass a failing suite or wedge the dispatcher.
 *
 * Pins: exit 0 and non-zero, combined output, cwd, timeout kill with a long-running
 *   child, spawn error rejection, a Worker-planted `node.cmd` in the cwd never being run
 *   (Windows), NoDefaultCurrentDirectoryInExePath set for the child, an unresolvable command refused.
 * Depends on: adapters/command-runner (real processes).
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runShellCommand } from '#/adapters/command-runner.js';

const base = {
  cwd: tmpdir(),
  env: { PATH: process.env['PATH'] ?? '' },
  timeoutMs: 20_000,
};

const node = (code: string): string => `node -e "${code}"`;

// 30s: each case spawns real processes, which are slow under full-suite load on Windows.
describe('runShellCommand', { timeout: 30_000 }, () => {
  it('returns exit code 0 and captured output', async () => {
    const r = await runShellCommand({ ...base, command: node('console.log(123)') });

    expect(r).toMatchObject({ exitCode: 0, timedOut: false });
    expect(r.output).toContain('123');
  });

  it('returns a non-zero exit code', async () => {
    const r = await runShellCommand({ ...base, command: node('process.exit(3)') });

    expect(r.exitCode).toBe(3);
  });

  it('captures stderr and runs in the given cwd', async () => {
    const r = await runShellCommand({
      ...base,
      command: node('console.error(process.cwd())'),
    });

    expect(r.output.toLowerCase()).toContain(tmpdir().toLowerCase().slice(0, 6));
  });

  it('kills the process tree on timeout', async () => {
    const started = Date.now();

    const r = await runShellCommand({
      ...base,
      timeoutMs: 300,
      command: node('setInterval(()=>{},1000)'),
    });

    expect(r.timedOut).toBe(true);
    expect(Date.now() - started).toBeLessThan(10_000);
  });

  it('rejects when the working directory does not exist', async () => {
    await expect(
      runShellCommand({
        ...base,
        cwd: `${tmpdir()}/definitely-missing-dir`,
        command: 'x',
      }),
    ).rejects.toThrow();
  });

  it.runIf(process.platform === 'win32')(
    'does not run a node.cmd planted in the worktree (cwd hijack)',
    async () => {
      const wt = await mkdtemp(join(tmpdir(), 'forge-hijack '));
      try {
        await writeFile(join(wt, 'node.cmd'), '@exit /b 0');

        const r = await runShellCommand({
          ...base,
          cwd: wt,
          command: node('process.exit(3)'),
        });

        expect(r.exitCode).toBe(3);
      } finally {
        await rm(wt, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      }
    },
  );

  it('sets NoDefaultCurrentDirectoryInExePath for the child', async () => {
    const r = await runShellCommand({
      ...base,
      command: node('console.log(process.env.NoDefaultCurrentDirectoryInExePath)'),
    });

    expect(r.output).toContain('1');
  });

  it('rejects a command that resolves nowhere instead of running it from the cwd', async () => {
    await expect(
      runShellCommand({ ...base, command: 'definitely-not-a-real-binary-xyz test' }),
    ).rejects.toThrow(/not found/);
  });
});
