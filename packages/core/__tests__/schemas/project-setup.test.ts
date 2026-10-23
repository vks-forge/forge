/**
 * Tests for the project `setup` steps and the worktree preparation record.
 *
 * Why: Forge runs these steps itself before a Worker starts (d-0180), so a typo in a step must
 *   fail when settings are saved, not when a ticket is waiting: a step that escapes the
 *   repository with `..`, a duplicate name the owner could not tell apart on the escalation
 *   card, or a variable name that is not one. "Absent" (use detected defaults) and "empty"
 *   (no setup) must stay different, because they decide whether Forge installs anything.
 *
 * Pins: SetupStep defaults and bounds, relative-only folders, unique names, at most ten steps,
 *   absent versus empty `setup`, and the record and failure shapes the git adapter and preparer
 *   share.
 * Depends on: src/schemas/project, src/schemas/setup-step, src/schemas/worktree-prep, vitest.
 */

import { describe, expect, it } from 'vitest';
import { ProjectConfigShape } from '#/schemas/project.js';
import { SetupStep } from '#/schemas/setup-step.js';
import { PrepOutcome, WorktreePrep } from '#/schemas/worktree-prep.js';

const step = { name: 'Install packages', command: 'npm ci' };
const base = { slug: 'sf', prefix: 'SF', default_harness: 'claude-code' };

describe('SetupStep', () => {
  it('fills defaults: no inputs, env or PATH folders, a 20 minute limit', () => {
    expect(SetupStep.parse(step)).toEqual({
      ...step,
      inputs: [],
      env: {},
      pass_env: [],
      path: [],
      cache_env: {},
      cache_outputs: [],
      timeout_minutes: 20,
    });
  });

  it.each(['../outside', '/abs', 'C:/abs', 'a/../b'])(
    'refuses the folder %s that leaves the repository',
    (cwd) => {
      expect(SetupStep.safeParse({ ...step, cwd }).success).toBe(false);
      expect(SetupStep.safeParse({ ...step, path: [cwd] }).success).toBe(false);
    },
  );

  it('accepts a relative folder and a repository-top step', () => {
    const parsed = SetupStep.parse({ ...step, cwd: 'web/app', at_repo_root: true });

    expect(parsed.cwd).toBe('web/app');
    expect(parsed.at_repo_root).toBe(true);
  });

  it('bounds the time limit to 1..120 minutes', () => {
    expect(SetupStep.safeParse({ ...step, timeout_minutes: 0 }).success).toBe(false);
    expect(SetupStep.safeParse({ ...step, timeout_minutes: 121 }).success).toBe(false);
    expect(SetupStep.safeParse({ ...step, timeout_minutes: 120 }).success).toBe(true);
  });

  it('refuses a blank command and names that are not variable names', () => {
    expect(SetupStep.safeParse({ ...step, command: '   ' }).success).toBe(false);
    expect(SetupStep.safeParse({ ...step, env: { '1BAD': 'x' } }).success).toBe(false);
    expect(SetupStep.safeParse({ ...step, pass_env: ['A B'] }).success).toBe(false);
    expect(SetupStep.safeParse({ ...step, pass_env: ['NPM_TOKEN'] }).success).toBe(true);
  });
});

describe('ProjectConfigShape setup', () => {
  it('leaves setup absent when the settings do not say, and keeps an empty list as "no setup"', () => {
    expect(ProjectConfigShape.parse(base).setup).toBeUndefined();
    expect(ProjectConfigShape.parse({ ...base, setup: [] }).setup).toEqual([]);
  });

  it('refuses duplicate step names and more than ten steps', () => {
    expect(ProjectConfigShape.safeParse({ ...base, setup: [step, step] }).success).toBe(
      false,
    );

    const eleven = Array.from({ length: 11 }, (_, i) => ({ ...step, name: `s${i}` }));

    expect(ProjectConfigShape.safeParse({ ...base, setup: eleven }).success).toBe(false);
    expect(
      ProjectConfigShape.safeParse({ ...base, setup: eleven.slice(0, 10) }).success,
    ).toBe(true);
  });
});

describe('worktree preparation record and outcome', () => {
  const prep = {
    key: 'a'.repeat(64),
    status: 'ready',
    outputs: ['node_modules'],
    path: ['/wt/FRG-1/.venv/bin'],
    steps: [{ name: 'Install packages', exit_code: 0, ms: 1200 }],
    at: '2026-10-20T10:00:00.000Z',
  };

  it('parses a stored record and refuses a malformed key or more than 50 outputs', () => {
    expect(WorktreePrep.safeParse(prep).success).toBe(true);
    expect(WorktreePrep.safeParse({ ...prep, key: 'nope' }).success).toBe(false);
    expect(
      WorktreePrep.safeParse({
        ...prep,
        outputs: Array.from({ length: 51 }, (_, i) => `d${i}`),
      }).success,
    ).toBe(false);
  });

  it('tells a success from a failure that names the step and keeps the tail within 4 KB', () => {
    const failure = {
      ok: false,
      step: 'Install packages',
      command: 'npm ci',
      exit_code: null,
      timed_out: true,
      tail: 'x'.repeat(4096),
      inputs_changed_by_worker: false,
    };

    expect(PrepOutcome.safeParse({ ok: true, prep }).success).toBe(true);
    expect(PrepOutcome.safeParse(failure).success).toBe(true);
    expect(PrepOutcome.safeParse({ ...failure, tail: 'x'.repeat(4097) }).success).toBe(
      false,
    );
  });
});
