/**
 * Tests for the tool folders a worktree's setup recorded, as a script gate sees them.
 *
 * Why: an owner's script gate (`pytest -q`) runs against the tree Forge prepared, so it must find
 *   the project's own tools in the folders setup created. The runner reads the worktree's record
 *   itself, so the engine passes nothing and a Worker cannot name a folder: the record sits
 *   outside every Worker cwd. A worktree with no record, or a manager that cannot read one, runs the
 *   command exactly as before.
 *
 * Pins: recorded folders go first on PATH and are trusted; no record leaves the request unchanged.
 * Depends on: adapters/script-gate-runner, node:path, vitest.
 */

import { delimiter } from 'node:path';
import type { WorktreePrep } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { createScriptGateRunner } from '#/adapters/script-gate-runner.js';
import type { CommandRequest } from '#/types/g1-deps.types.js';

const record = (path: string[]): WorktreePrep => ({
  key: 'c'.repeat(64),
  status: 'ready',
  outputs: [],
  path,
  steps: [],
  at: '2026-10-21T00:00:00.000Z',
});

async function seen(prep: WorktreePrep | null | undefined): Promise<CommandRequest> {
  const calls: CommandRequest[] = [];
  const runner = createScriptGateRunner({
    worktrees: {
      diff: async () => ({ files: [], patch: '' }),
      ...(prep === undefined ? {} : { readPrep: async () => prep }),
    },
    env: { PATH: '/bin' },
    runCommand: async (req) => {
      calls.push(req);

      return { exitCode: 0, timedOut: false, output: '' };
    },
  });

  await runner.run({
    worktreePath: '/wt',
    baseSha: 'abc',
    command: 'pytest -q',
    timeoutMs: 5_000,
    guardPaths: [],
    expect: 'pass',
  });

  return calls[0] as CommandRequest;
}

describe('script gate with a prepared tree', () => {
  it('runs with the recorded tool folders first on PATH and trusted', async () => {
    const req = await seen(record(['/wt/.venv/bin']));

    expect(req.env['PATH']).toBe(['/wt/.venv/bin', '/bin'].join(delimiter));
    expect(req.trustedDirs).toEqual(['/wt/.venv/bin']);
  });

  it('changes nothing without a record, or when the manager cannot read one', async () => {
    for (const prep of [null, undefined]) {
      const req = await seen(prep);

      expect(req.env['PATH']).toBe('/bin');
      expect(req.trustedDirs).toBeUndefined();
    }
  });
});
