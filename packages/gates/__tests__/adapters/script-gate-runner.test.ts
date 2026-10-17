/**
 * Script gate runner tests.
 *
 * Why: a script gate is the owner's own check as a pipeline stage, and the Worker wrote the code
 *   it judges. If the runner ran a command after the Worker edited the script or a guarded file,
 *   or read a green red-proof as a pass, a Worker could grade its own work. These pin the closed
 *   decisions: guarded diffs fail without running, exit codes map to verdicts both for a gate
 *   and for the red proof, timeouts and unstartable commands are errors, and the command only
 *   sees the stripped environment.
 *
 * Pins: explicit guard globs, auto-guard of a relative first token and of an interpreter's script,
 *   cwd escape, expect pass/fail on exit 0 / non-zero / timeout / spawn error, env scrubbing, one
 *   real process.
 * Depends on: adapters/script-gate-runner, @forge/core, vitest.
 */

import { tmpdir } from 'node:os';
import type { WorktreeDiff } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { createScriptGateRunner } from '#/adapters/script-gate-runner.js';
import type { CommandRequest, CommandResult } from '#/types/g1-deps.types.js';

const diffOf = (...paths: string[]): WorktreeDiff => ({
  files: paths.map((path) => ({ status: 'M' as const, path })),
  patch: '',
});

function rig(result: CommandResult | Error, diff: WorktreeDiff = diffOf('src/a.ts')) {
  const calls: CommandRequest[] = [];
  const runner = createScriptGateRunner({
    worktrees: { diff: async () => diff },
    env: { PATH: '/bin', ANTHROPIC_API_KEY: 'secret', FORGE_RUN_TOKEN: 'tok' },
    runCommand: async (req) => {
      calls.push(req);
      if (result instanceof Error) {
        throw result;
      }

      return result;
    },
  });

  return { runner, calls };
}

const base = {
  worktreePath: '/wt',
  baseSha: 'abc',
  command: 'pnpm lint',
  timeoutMs: 5_000,
  guardPaths: [] as string[],
  expect: 'pass' as const,
};

const ok: CommandResult = { exitCode: 0, timedOut: false, output: 'fine' };
const bad: CommandResult = {
  exitCode: 1,
  timedOut: false,
  output: 'lint error on line 3',
};

describe('script gate: pass', () => {
  it('passes on exit 0', async () => {
    const { runner } = rig(ok);

    const v = await runner.run(base);

    expect(v.status).toBe('passed');
    expect(v.report).toContain('exit code 0');
  });

  it('fails on a non-zero exit and keeps the output in the finding', async () => {
    const { runner } = rig(bad);

    const v = await runner.run(base);

    expect(v.status).toBe('failed');
    expect(v.findings[0]?.message).toContain('lint error on line 3');
  });

  it('is an error on timeout, never a pass', async () => {
    const { runner } = rig({ exitCode: null, timedOut: true, output: '' });

    expect((await runner.run(base)).status).toBe('error');
  });

  it('is an error when the command cannot start', async () => {
    const { runner } = rig(new Error('spawn ENOENT'));

    const v = await runner.run(base);

    expect(v.status).toBe('error');
    expect(v.report).toContain('ENOENT');
  });
});

describe('script gate: red proof (expect fail)', () => {
  it('passes when the command fails: the tests are red', async () => {
    const { runner } = rig(bad);

    expect((await runner.run({ ...base, expect: 'fail' })).status).toBe('passed');
  });

  it('fails when the command passes: the new tests already pass', async () => {
    const { runner } = rig(ok);

    const v = await runner.run({ ...base, expect: 'fail' });

    expect(v.status).toBe('failed');
    expect(v.findings[0]?.message).toMatch(/already pass/);
  });

  it('is an error on timeout or a command that cannot start', async () => {
    const slow = rig({ exitCode: null, timedOut: true, output: '' });
    const broken = rig(new Error('nope'));

    expect((await slow.runner.run({ ...base, expect: 'fail' })).status).toBe('error');
    expect((await broken.runner.run({ ...base, expect: 'fail' })).status).toBe('error');
  });
});

describe('script gate: guards fail closed without running', () => {
  it('fails when the diff touches an explicit guard glob', async () => {
    const { runner, calls } = rig(ok, diffOf('src/a.ts', '.github/workflows/ci.yml'));

    const v = await runner.run({ ...base, guardPaths: ['.github/**'] });

    expect(v.status).toBe('failed');
    expect(v.findings[0]?.message).toContain('.github/workflows/ci.yml');
    expect(calls).toHaveLength(0);
  });

  it('guards the script a relative first token starts', async () => {
    const { runner, calls } = rig(ok, diffOf('scripts/x.sh'));

    const v = await runner.run({ ...base, command: './scripts/x.sh --all' });

    expect(v.status).toBe('failed');
    expect(calls).toHaveLength(0);
  });

  it('guards the script an interpreter is given', async () => {
    const { runner, calls } = rig(ok, diffOf('tools/check.js'));

    const v = await runner.run({ ...base, command: 'node --no-warnings tools/check.js' });

    expect(v.status).toBe('failed');
    expect(calls).toHaveLength(0);
  });

  it('guards a renamed-from path too', async () => {
    const { runner } = rig(ok, {
      files: [{ status: 'R', path: 'src/new.sh', oldPath: 'scripts/x.sh' }],
      patch: '',
    });

    expect((await runner.run({ ...base, guardPaths: ['scripts/**'] })).status).toBe(
      'failed',
    );
  });

  it('runs when the diff touches nothing guarded', async () => {
    const { runner, calls } = rig(ok);

    const v = await runner.run({
      ...base,
      command: 'node scripts/x.js',
      guardPaths: ['ci/**'],
    });

    expect(v.status).toBe('passed');
    expect(calls).toHaveLength(1);
  });

  it('refuses a working directory outside the worktree', async () => {
    const { runner, calls } = rig(ok);

    const v = await runner.run({ ...base, cwd: '../elsewhere' });

    expect(v.status).toBe('failed');
    expect(calls).toHaveLength(0);
  });
});

describe('script gate: environment and cwd', () => {
  it('hands the command only the allowlisted environment', async () => {
    const { runner, calls } = rig(ok);

    await runner.run({ ...base, cwd: 'packages/a' });

    expect(calls[0]?.env['PATH']).toBe('/bin');
    expect(calls[0]?.env).not.toHaveProperty('ANTHROPIC_API_KEY');
    expect(calls[0]?.env).not.toHaveProperty('FORGE_RUN_TOKEN');
    expect(calls[0]?.cwd.replaceAll('\\', '/')).toMatch(/wt\/packages\/a$/);
    expect(calls[0]?.timeoutMs).toBe(5_000);
  });
});

describe('script gate: a real process', { timeout: 30_000 }, () => {
  it('passes a command that exits 0 and fails one that exits 3', async () => {
    const real = createScriptGateRunner({
      worktrees: { diff: async () => diffOf() },
      env: { PATH: process.env['PATH'] },
    });

    const req = { ...base, worktreePath: tmpdir(), timeoutMs: 20_000 };
    const green = await real.run({ ...req, command: 'node -e "process.exit(0)"' });
    const red = await real.run({ ...req, command: 'node -e "process.exit(3)"' });

    expect(green.status).toBe('passed');
    expect(red.status).toBe('failed');
    expect(red.report).toContain('exit code 3');
  });
});
