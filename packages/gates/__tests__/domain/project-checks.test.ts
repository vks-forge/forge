/**
 * Project check tests — pin how every configured check becomes findings.
 *
 * Why: the project's own commands are the final word on whether code works, in any
 *   language. A non-zero exit or timeout must fail, a command that cannot start must be
 *   `error` (not pass), a role the project did not configure must be absent rather than
 *   skipped or passed, a check that could not even start (empty command, cwd outside the
 *   worktree) must fail closed, and the Worker must never see Forge's secrets through
 *   the environment.
 *
 * Pins: list order, all roles run (build, format, custom), all checks run after a
 *   failure, tail in the report, cwd handling, empty command, spawn failure, timeout,
 *   FORGE_* scrubbed from env.
 * Depends on: domain/project-checks, shared/env, shared/tail.
 */

import { describe, expect, it } from 'vitest';
import { runProjectChecks } from '#/domain/project-checks.js';
import { scrubEnv } from '#/shared/env.js';
import { tail } from '#/shared/tail.js';
import type { CommandRequest, CommandResult } from '#/types/g1-deps.types.js';
import { checksOf, context } from '#tests/helpers/fixtures.js';

const ALL = { lint: 'L', typecheck: 'T', test: 'X' };

function input(
  run: (r: CommandRequest) => Promise<CommandResult>,
  checks: ReturnType<typeof checksOf> = checksOf(ALL),
) {
  return {
    // Spread, not parsed: the gate must also hold when a bad check got past the schema.
    project: { ...context().project, checks },
    cwd: '/wt',
    env: { PATH: '/bin', FORGE_RUN_TOKEN: 'secret', forge_x: 'y' },
    run,
    timeoutMs: 50,
  };
}

const ok = (): Promise<CommandResult> =>
  Promise.resolve({ exitCode: 0, timedOut: false, output: '' });

describe('runProjectChecks', () => {
  it('runs lint, typecheck, test in order and passes when all exit 0', async () => {
    const seen: string[] = [];

    const out = await runProjectChecks(
      input((r) => {
        seen.push(r.command);

        return ok();
      }),
    );

    expect(seen).toEqual(['L', 'T', 'X']);
    expect(out.status).toBe('passed');
  });

  it('fails on non-zero exit, keeps running the rest and reports the output tail', async () => {
    const seen: string[] = [];

    const out = await runProjectChecks(
      input((r) => {
        seen.push(r.command);

        return Promise.resolve({
          exitCode: r.command === 'L' ? 2 : 0,
          timedOut: false,
          output: 'lint exploded',
        });
      }),
    );

    expect(seen).toEqual(['L', 'T', 'X']);
    expect(out.status).toBe('failed');
    expect(out.findings[0]?.check).toBe('project:lint');
    expect(out.details).toContain('lint exploded');
  });

  it('puts the output tail in the finding message, not only the exit code', async () => {
    const long = `${'x'.repeat(5000)}
FAIL src/a.test.ts expected 3 got 4`;

    const out = await runProjectChecks(
      input(
        () => Promise.resolve({ exitCode: 1, timedOut: false, output: long }),
        checksOf({ test: 'X' }),
      ),
    );

    const message = out.findings[0]?.message ?? '';

    expect(message).toContain('exit code 1');
    expect(message).toContain('FAIL src/a.test.ts expected 3 got 4');
    expect(message.length).toBeLessThan(2000);
  });

  it('passes passEnv names through to the scrubber', async () => {
    let req: CommandRequest | undefined;

    await runProjectChecks({
      ...input(
        (r) => {
          req = r;

          return ok();
        },
        checksOf({ test: 'X' }),
      ),
      env: { PATH: '/bin', DATABASE_URL: 'sqlite::memory:' },
      passEnv: ['DATABASE_URL'],
    });

    expect(req?.env['DATABASE_URL']).toBe('sqlite::memory:');
  });

  it('fails on timeout', async () => {
    const out = await runProjectChecks(
      input(
        () => Promise.resolve({ exitCode: null, timedOut: true, output: '' }),
        checksOf({ test: 'X' }),
      ),
    );

    expect(out.status).toBe('failed');
    expect(out.findings[0]?.message).toContain('timed out');
  });

  it('runs every role in list order, build, format and custom included', async () => {
    const seen: string[] = [];
    const checks = [
      { name: 'compile', role: 'build' as const, command: 'B' },
      { name: 'unit', role: 'test' as const, command: 'X' },
      { name: 'fmt', role: 'format' as const, command: 'F' },
      { name: 'audit', role: 'custom' as const, command: 'A' },
    ];

    const out = await runProjectChecks(
      input((r) => {
        seen.push(r.command);

        return ok();
      }, checks),
    );

    expect(seen).toEqual(['B', 'X', 'F', 'A']);
    expect(out.status).toBe('passed');
    expect(out.details).toContain('compile (build): passed');
  });

  it('has no entry for a role the project did not configure', async () => {
    const out = await runProjectChecks(input(ok, checksOf({ test: 'X' })));

    expect(out.details).not.toContain('typecheck');
    expect(out.details).not.toContain('skipped');
    expect(out.details).not.toContain('not configured');
  });

  it('names the failing check and its role in the finding', async () => {
    const out = await runProjectChecks(
      input(
        () => Promise.resolve({ exitCode: 1, timedOut: false, output: 'boom' }),
        [{ name: 'go-unit', role: 'test', command: 'go test ./...' }],
      ),
    );

    expect(out.findings[0]).toMatchObject({ check: 'project:go-unit' });
    expect(out.findings[0]?.message).toContain('test check `go test ./...` failed');
  });

  it('runs a check in its cwd under the worktree', async () => {
    let req: CommandRequest | undefined;

    await runProjectChecks(
      input(
        (r) => {
          req = r;

          return ok();
        },
        [{ name: 'web', role: 'test', command: 'X', cwd: 'web/app' }],
      ),
    );

    expect(req?.cwd.replaceAll('\\', '/')).toMatch(/\/wt\/web\/app$/);
  });

  it('fails closed on a cwd outside the worktree without running anything', async () => {
    const seen: string[] = [];
    const checks = [{ name: 'x', role: 'test' as const, command: 'X', cwd: '../out' }];

    const out = await runProjectChecks(
      input((r) => {
        seen.push(r.command);

        return ok();
      }, checks),
    );

    expect(seen).toEqual([]);
    expect(out.status).toBe('failed');
    expect(out.findings[0]?.message).toContain('outside the worktree');
  });

  it('fails closed on an empty command instead of passing it', async () => {
    const seen: string[] = [];
    const checks = [{ name: 'unit', role: 'test' as const, command: '   ' }];

    const out = await runProjectChecks(
      input((r) => {
        seen.push(r.command);

        return ok();
      }, checks),
    );

    expect(seen).toEqual([]);
    expect(out.status).toBe('failed');
    expect(out.findings[0]?.message).toContain('command is empty');
  });

  it('reports error when a command cannot be spawned', async () => {
    const out = await runProjectChecks(input(() => Promise.reject(new Error('ENOENT'))));

    expect(out.status).toBe('error');
    expect(out.details).toContain('ENOENT');
  });

  it('passes the scrubbed environment and cwd to the runner', async () => {
    let req: CommandRequest | undefined;

    await runProjectChecks(
      input(
        (r) => {
          req = r;

          return ok();
        },
        checksOf({ test: 'X' }),
      ),
    );

    expect(req?.env).toEqual({
      PATH: '/bin',
      CI: '1',
      NoDefaultCurrentDirectoryInExePath: '1',
    });

    expect(req?.cwd).toBe('/wt');
  });
});

describe('helpers', () => {
  it('scrubEnv keeps only allowlisted names, case-insensitively, and forces CI and the cwd guard', () => {
    const out = scrubEnv({
      Path: 'p',
      SystemRoot: 'C:/Windows',
      temp: 't',
      USERPROFILE: 'u',
      'ProgramFiles(x86)': 'x',
      CI: '0',
      ANTHROPIC_API_KEY: 'sk-x',
      GH_TOKEN: 'g',
      FORGE_RUN_TOKEN: 'f',
      forge_y: '3',
      NODE_OPTIONS: '--require x',
      B: undefined,
    });

    expect(out).toEqual({
      Path: 'p',
      SystemRoot: 'C:/Windows',
      temp: 't',
      USERPROFILE: 'u',
      'ProgramFiles(x86)': 'x',
      CI: '1',
      NoDefaultCurrentDirectoryInExePath: '1',
    });
  });

  it('scrubEnv passes an explicit passEnv list and never lets it override the guard', () => {
    const out = scrubEnv(
      { MY_FLAG: 'on', Other: 'no', NoDefaultCurrentDirectoryInExePath: '0' },
      ['my_flag', 'NoDefaultCurrentDirectoryInExePath'],
    );

    expect(out).toEqual({
      MY_FLAG: 'on',
      CI: '1',
      NoDefaultCurrentDirectoryInExePath: '1',
    });
  });

  it('tail keeps the end of long output', () => {
    expect(tail('abcdef', 3)).toBe('[...cut...]\ndef');
    expect(tail('abc', 3)).toBe('abc');
  });
});
