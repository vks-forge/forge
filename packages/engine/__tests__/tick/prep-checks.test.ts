/**
 * Tests for the setup step before gates and script checks.
 *
 * Why: the gates must judge the code against the packages the Worker asked for, but a failed
 *   install is only the Worker's fault when the Worker changed a file the install reads. The
 *   verdict has to tell the two apart: a failed `setup` gate goes back to the Worker with the output,
 *   anything else is an error the engine retries or parks. The red proof reads a failed verdict as
 *   its own result, so setup must never look like one there.
 *
 * Pins: no preparer or an empty plan means no setup and the check runs; a Worker-caused failure is a
 *   failed verdict that names the step and carries the tail; any other failure is an error verdict;
 *   `asError` makes every failure an error and the check never runs.
 * Depends on: src/tick/prep-checks, helpers/fake-preparer, @forge/core, vitest.
 */

import { ProjectConfig } from '@forge/core';
import type { GateVerdict } from '@forge/core';
import { describe, expect, it, vi } from 'vitest';
import { prepareForChecks, setupVerdict, withPrepared } from '#/tick/prep-checks.js';
import { createFakePreparer, failure } from '#tests/helpers/fake-preparer.js';

const config = ProjectConfig.parse({
  slug: 'forge',
  prefix: 'FG',
  default_harness: 'scripted',
});

const passed: GateVerdict = { status: 'passed', findings: [], report: 'ok' };

describe('prepareForChecks', () => {
  it('has nothing to do without a preparer or with an empty plan', async () => {
    expect(await prepareForChecks({ config }, '/w', 'base')).toBeNull();
    const prepare = createFakePreparer(false);

    expect(await prepareForChecks({ config, prepare }, '/w', 'base')).toBeNull();
    expect(prepare.ran).toEqual([]);
  });

  it('returns the failing step, and the base sha reaches the preparer', async () => {
    const prepare = createFakePreparer();
    prepare.result = failure();

    expect(await prepareForChecks({ config, prepare }, '/w', 'abc')).toMatchObject({
      ok: false,
      step: 'Install packages',
    });

    expect(prepare.baseShas).toEqual(['abc']);
  });
});

describe('setupVerdict', () => {
  it('fails the gate when the Worker changed the files the install reads', () => {
    const v = setupVerdict(failure({ inputs_changed_by_worker: true, tail: 'bad lock' }));

    expect(v.status).toBe('failed');
    expect(v.findings[0]).toMatchObject({ check: 'setup' });
    expect(v.findings[0]?.message).toContain('Install packages');
    expect(v.findings[0]?.message).toContain('bad lock');
  });

  it('is an error when the Worker did not cause it, and says how it ended', () => {
    expect(setupVerdict(failure({ timed_out: true })).status).toBe('error');
    expect(setupVerdict(failure({ exit_code: null })).findings[0]?.message).toContain(
      'could not start',
    );

    expect(setupVerdict(failure({ exit_code: 3 })).findings[0]?.message).toContain(
      'code 3',
    );
  });
});

describe('withPrepared', () => {
  it('runs the check once the tree is ready', async () => {
    const run = vi.fn(async () => passed);
    const prepare = createFakePreparer();

    expect(await withPrepared({ config, prepare }, '/w', 'b', run)).toBe(passed);
    expect(run).toHaveBeenCalledOnce();
  });

  it('returns the setup verdict instead, and never runs the check, on a failure', async () => {
    const prepare = createFakePreparer();
    prepare.result = failure({ inputs_changed_by_worker: true });
    const run = vi.fn(async () => passed);

    const verdict = await withPrepared({ config, prepare }, '/w', 'b', run);
    const proof = await withPrepared({ config, prepare }, '/w', 'b', run, true);

    expect(verdict.status).toBe('failed');
    expect(proof.status).toBe('error');
    expect(run).not.toHaveBeenCalled();
  });
});
