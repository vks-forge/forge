/**
 * Tests for how the worktree preparer reports a failed setup and the owner's "skip".
 *
 * Why: when an install step stops, the owner must see which step and what it printed instead of a
 *   crash (d-0180), and the engine must know whether the Worker's own edit to the lockfile is the
 *   likely cause (the work then goes back to the Worker, not to the owner). "Start without setup"
 *   must be remembered for the same plan and inputs, and forgotten when the inputs change.
 *
 * Pins: stop at the first failing step, exit code, timeout, a command that cannot start, a tail
 *   bounded to 4 KB that keeps the end of the output, no record stored on failure,
 *   `inputs_changed_by_worker`, and the skipped record.
 * Depends on: helpers/prep-rig, adapters/worktree-preparer, @forge/core (SetupStep), vitest.
 */

import { SetupStep } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { useRigs } from '#tests/helpers/prep-rig.js';
import type { Rig } from '#tests/helpers/prep-rig.js';

const rig = useRigs();

const BASE = { baseSha: 'b'.repeat(40) };
const install = SetupStep.parse({
  name: 'Install packages',
  command: 'npm ci',
  inputs: ['package-lock.json', 'package.json'],
});

const plan = (...steps: SetupStep[]) => ({ steps, source: 'settings' as const });

describe('prepare failures', () => {
  const two = [
    SetupStep.parse({ name: 'First', command: 'one' }),
    SetupStep.parse({ name: 'Second', command: 'two' }),
  ];

  it('stops at the first failing step and reports its exit code and output without storing a record', async () => {
    const r = rig();
    r.script = [{ result: { exitCode: 2, output: 'ERR! boom' } }];

    const out = await r.prep.prepare(r.project, plan(...two), BASE);

    expect(out).toEqual({
      ok: false,
      step: 'First',
      command: 'one',
      exit_code: 2,
      timed_out: false,
      tail: 'ERR! boom',
      inputs_changed_by_worker: false,
    });

    expect(r.calls).toHaveLength(1);
    expect(r.record).toBeNull();
  });

  it('keeps only the end of a long output, within 4 KB', async () => {
    const r = rig();
    r.script = [{ result: { exitCode: 1, output: `${'x'.repeat(10_000)}THE END` } }];

    const out = await r.prep.prepare(r.project, plan(...two), BASE);

    expect(!out.ok && out.tail.length).toBeLessThanOrEqual(4096);
    expect(!out.ok && out.tail.endsWith('THE END')).toBe(true);
  });

  it('reports a timeout with no exit code', async () => {
    const r = rig();
    r.script = [{ result: { exitCode: null, timedOut: true, output: 'still going' } }];

    const out = await r.prep.prepare(r.project, plan(...two), BASE);

    expect(out).toMatchObject({ ok: false, exit_code: null, timed_out: true });
  });

  it('reports a command that could not start (not on PATH) as a failure, not a throw', async () => {
    const r = rigWith(new Error('command "pnpm" not found on PATH'));

    const out = await r.prep.prepare(r.project, plan(...two), BASE);

    expect(out).toMatchObject({
      ok: false,
      step: 'First',
      exit_code: null,
      timed_out: false,
      tail: 'command "pnpm" not found on PATH',
    });
  });

  it("flags a failure when the Worker changed one of the steps' input files", async () => {
    const r = rig();
    r.script = [{ result: { exitCode: 1 } }, { result: { exitCode: 1 } }];
    r.changed = ['src/a.ts'];

    const unrelated = await r.prep.prepare(r.project, plan(install), BASE);

    r.changed = ['src/a.ts', 'package-lock.json'];
    const related = await r.prep.prepare(r.project, plan(install), BASE);

    expect(unrelated).toMatchObject({ ok: false, inputs_changed_by_worker: false });
    expect(related).toMatchObject({ ok: false, inputs_changed_by_worker: true });
  });
});

describe('skip', () => {
  it('stores a skipped record so the same plan is then ready without running, until its inputs change', async () => {
    const r = rig();
    r.write('package-lock.json', 'one');

    const rec = await r.prep.skip(r.project, plan(install));
    const again = await r.prep.prepare(r.project, plan(install), BASE);

    expect(rec.status).toBe('skipped');
    expect(again).toMatchObject({ ok: true, prep: { status: 'skipped' } });
    expect(r.calls).toEqual([]);

    r.write('package-lock.json', 'two');
    await r.prep.prepare(r.project, plan(install), BASE);

    expect(r.calls).toHaveLength(1);
  });
});

function rigWith(error: Error): Rig {
  const r = rig();
  r.script = [{ rejects: error }];

  return r;
}
