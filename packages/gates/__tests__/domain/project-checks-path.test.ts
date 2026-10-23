/**
 * Tests for the tool folders a worktree's setup recorded, as the checks see them.
 *
 * Why: a Python project's `pytest` lives in the `.venv` that setup created, and a PATH that does
 *   not name it makes every check fail with "command not found" on a tree that installed fine. The
 *   checks must run with those folders first on PATH and allowed as a place to run from, and with
 *   nothing changed when the project has none, so no other project's commands behave differently.
 *
 * Pins: folders go first on PATH ahead of the scrubbed one and are passed as trusted folders; no
 *   folders leaves PATH and the request as they were.
 * Depends on: domain/project-checks, helpers/fixtures, node:path, vitest.
 */

import { delimiter } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runProjectChecks } from '#/domain/project-checks.js';
import type { CommandRequest } from '#/types/g1-deps.types.js';
import { checksOf, context } from '#tests/helpers/fixtures.js';

async function seen(pathDirs?: string[]): Promise<CommandRequest> {
  const calls: CommandRequest[] = [];
  await runProjectChecks({
    project: { ...context().project, checks: checksOf({ test: 'pytest' }) },
    cwd: '/wt',
    env: { PATH: '/bin' },
    ...(pathDirs === undefined ? {} : { pathDirs }),
    run: async (r) => {
      calls.push(r);

      return { exitCode: 0, timedOut: false, output: '' };
    },
    timeoutMs: 50,
  });

  return calls[0] as CommandRequest;
}

describe('runProjectChecks with tool folders', () => {
  it('puts them first on PATH and trusts them', async () => {
    const req = await seen(['/wt/.venv/bin']);

    expect(req.env['PATH']).toBe(['/wt/.venv/bin', '/bin'].join(delimiter));
    expect(req.trustedDirs).toEqual(['/wt/.venv/bin']);
  });

  it('changes nothing without any', async () => {
    const req = await seen();

    expect(req.env['PATH']).toBe('/bin');
    expect(req.trustedDirs).toBeUndefined();
  });
});
