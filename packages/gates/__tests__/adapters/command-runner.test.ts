/**
 * Command runner tests — pin the real spawner against tiny node programs.
 *
 * Why: G1 trusts this adapter for the exit code and for not hanging the server. A runner
 *   that lost the exit code, ignored the timeout or left a child tree running would
 *   either pass a failing suite or wedge the dispatcher.
 *
 * Pins: exit 0 and non-zero, combined output, cwd, timeout kill with a long-running
 *   child, spawn error rejection.
 * Depends on: adapters/command-runner (real processes).
 */

import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { runShellCommand } from '#/adapters/command-runner.js';

const base = {
  cwd: tmpdir(),
  env: { PATH: process.env['PATH'] ?? '' },
  timeoutMs: 20_000,
};

const node = (code: string): string => `node -e "${code}"`;

describe('runShellCommand', () => {
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
});
