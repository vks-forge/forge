/**
 * Project check tests — pin how lint/typecheck/test results become findings.
 *
 * Why: the project's own commands are the final word on whether code works. A non-zero
 *   exit or timeout must fail, a command that cannot start must be `error` (not pass),
 *   a generic-profile repo must not be failed or passed by a TS-only check, and the
 *   Worker must never see Forge's secrets through the environment.
 *
 * Pins: ordering, all commands run after a failure, tail in the report, skipped
 *   typecheck under generic, spawn failure, timeout, FORGE_* scrubbed from env.
 * Depends on: domain/project-checks, shared/env, shared/tail.
 */

import { describe, expect, it } from 'vitest';
import { runProjectChecks } from '#/domain/project-checks.js';
import { scrubEnv } from '#/shared/env.js';
import { tail } from '#/shared/tail.js';
import type { CommandRequest, CommandResult } from '#/types/g1-deps.types.js';
import { context } from '#tests/helpers/fixtures.js';

const ALL = { lint: 'L', typecheck: 'T', test: 'X' };

function input(
  run: (r: CommandRequest) => Promise<CommandResult>,
  profile: 'ts' | 'generic' = 'ts',
  commands: Record<string, string> = ALL,
) {
  return {
    project: context({ profile, commands }).project,
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

  it('fails on timeout', async () => {
    const out = await runProjectChecks(
      input(() => Promise.resolve({ exitCode: null, timedOut: true, output: '' }), 'ts', {
        test: 'X',
      }),
    );

    expect(out.status).toBe('failed');
    expect(out.findings[0]?.message).toContain('timed out');
  });

  it('skips typecheck with a reason under profile generic', async () => {
    const seen: string[] = [];

    const out = await runProjectChecks(
      input((r) => {
        seen.push(r.command);

        return ok();
      }, 'generic'),
    );

    expect(seen).toEqual(['L', 'X']);
    expect(out.details).toContain('typecheck: skipped');
    expect(out.status).toBe('passed');
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
        'ts',
        { test: 'X' },
      ),
    );

    expect(req?.env).toEqual({ PATH: '/bin' });
    expect(req?.cwd).toBe('/wt');
  });
});

describe('helpers', () => {
  it('scrubEnv drops FORGE_ keys case-insensitively and undefined values', () => {
    expect(scrubEnv({ A: '1', FORGE_X: '2', forge_y: '3', B: undefined })).toEqual({
      A: '1',
    });
  });

  it('tail keeps the end of long output', () => {
    expect(tail('abcdef', 3)).toBe('[...cut...]\ndef');
    expect(tail('abc', 3)).toBe('abc');
  });
});
