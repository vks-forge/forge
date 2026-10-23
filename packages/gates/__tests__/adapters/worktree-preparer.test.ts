/**
 * Tests for the worktree preparer: planning, running, skipping and reporting setup.
 *
 * Why: before a Worker starts, Forge installs what the project's checks need (d-0180). If the
 *   preparer reinstalled every time, tickets would wait minutes for nothing; if it skipped when a
 *   lockfile changed, checks would run against stale packages; if it ran install commands in a
 *   Worker-visible way it would leak server secrets; and if a failure were thrown or vague, the
 *   owner would get a crash instead of "the step Install packages stopped with this output".
 *   An empty plan (a repo with no package manager) must cost nothing and never be an error.
 *
 * Pins: settings steps win over detection (even empty), detection from the worktree and the
 *   repository top, an empty plan runs nothing and stores nothing, step order and folders, a
 *   scrubbed environment with `pass_env` and the step's own variables, tool folders on PATH once
 *   they exist, skip on an equal key and rerun on a changed lockfile, and recorded outputs kept
 *   across reruns. Failures and the owner's "start without setup" record are in
 *   worktree-preparer-failures.test.ts.
 * Depends on: helpers/prep-rig, adapters/worktree-preparer, @forge/core (SetupStep), vitest.
 */

import { join } from 'node:path';
import { SetupStep } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { useRigs } from '#tests/helpers/prep-rig.js';

const rig = useRigs();

const BASE = { baseSha: 'b'.repeat(40) };
const install = SetupStep.parse({
  name: 'Install packages',
  command: 'npm ci',
  inputs: ['package-lock.json', 'package.json'],
});

const plan = (...steps: SetupStep[]) => ({ steps, source: 'settings' as const });

describe('plan', () => {
  it('uses the owner steps, even an empty list, instead of detecting', async () => {
    const r = rig();
    r.write('package-lock.json', '{}');

    expect(await r.prep.plan(r.project, { setup: [] })).toEqual({
      steps: [],
      source: 'settings',
    });

    expect((await r.prep.plan(r.project, { setup: [install] })).steps).toEqual([install]);
  });

  it('detects defaults from the worktree when the settings have none', async () => {
    const r = rig();
    r.write('package-lock.json', '{}');
    r.write('package.json', '{}');

    const p = await r.prep.plan(r.project, {});

    expect(p.source).toBe('detected');
    expect(p.steps.map((s) => s.command)).toEqual(['npm ci --no-audit --no-fund']);
  });

  it('finds the repository top lockfile for a project in a subfolder', async () => {
    const r = rig({ subdir: 'app' });
    r.write('pnpm-lock.yaml', '');
    r.write('app/package.json', '{}');

    const p = await r.prep.plan(r.project, {});

    expect(p.steps).toMatchObject([
      { command: 'pnpm install --frozen-lockfile', at_repo_root: true },
    ]);
  });

  it('plans nothing for a project with no package manager', async () => {
    const r = rig();
    r.write('inventory.yml', 'all: {}');

    expect(await r.prep.plan(r.project, {})).toEqual({ steps: [], source: 'detected' });
  });
});

describe('prepare', () => {
  it('runs nothing and stores nothing for an empty plan', async () => {
    const r = rig();

    const out = await r.prep.prepare(r.project, plan(), BASE);

    expect(out).toMatchObject({ ok: true, prep: { status: 'ready', steps: [] } });
    expect(r.calls).toEqual([]);
    expect(r.record).toBeNull();
  });

  it('runs the steps in order in their folders with their time limit and records the outcome', async () => {
    const r = rig({ subdir: 'app' });
    r.listing = ['README.md'];
    r.script = [{}, { untracked: ['README.md', 'app/node_modules'] }];
    const first = SetupStep.parse({
      name: 'Fetch submodules',
      command: 'git submodule update',
      at_repo_root: true,
    });

    const second = SetupStep.parse({
      name: 'Install packages',
      command: 'npm ci',
      cwd: 'web',
      timeout_minutes: 7,
    });

    const out = await r.prep.prepare(r.project, plan(first, second), BASE);

    expect(r.calls.map((c) => [c.command, c.cwd, c.timeoutMs])).toEqual([
      ['git submodule update', r.root, 20 * 60_000],
      ['npm ci', join(r.project, 'web'), 7 * 60_000],
    ]);

    expect(out).toMatchObject({
      ok: true,
      prep: {
        status: 'ready',
        outputs: ['app/node_modules'],
        steps: [
          { name: 'Fetch submodules', exit_code: 0, ms: 1000 },
          { name: 'Install packages', exit_code: 0, ms: 1000 },
        ],
      },
    });

    expect(r.record).toEqual(out.ok ? out.prep : null);
  });

  it('gives a step a scrubbed environment plus its own variables and pass_env names', async () => {
    const r = rig();
    const step = SetupStep.parse({
      name: 'Install',
      command: 'poetry install',
      env: { POETRY_VIRTUALENVS_IN_PROJECT: 'true' },
      pass_env: ['NPM_TOKEN'],
    });

    await r.prep.prepare(r.project, plan(step), BASE);

    expect(r.calls[0]?.env).toMatchObject({
      NPM_TOKEN: 'secret',
      POETRY_VIRTUALENVS_IN_PROJECT: 'true',
      CI: '1',
    });

    expect(r.calls[0]?.env).not.toHaveProperty('ANTHROPIC_API_KEY');
  });

  it('puts a tool folder on PATH once an earlier step created it, and records it', async () => {
    const r = rig();
    r.script = [{ makes: ['.venv/bin'] }, {}];
    const venv = SetupStep.parse({
      name: 'Create venv',
      command: 'python -m venv .venv',
      path: ['.venv/bin'],
    });

    const pip = SetupStep.parse({
      name: 'Install',
      command: 'python -m pip install -e .',
      path: ['.venv/bin'],
    });

    const bin = join(r.project, '.venv', 'bin').replaceAll('\\', '/');

    const out = await r.prep.prepare(r.project, plan(venv, pip), BASE);

    expect(r.calls[0]?.trustedDirs).toEqual([]);
    expect(r.calls[1]?.trustedDirs).toEqual([bin]);
    expect(r.calls[1]?.env['PATH']?.startsWith(bin)).toBe(true);
    expect(out.ok && out.prep.path).toEqual([bin]);
  });

  it('skips when the stored key matches and reruns when the lockfile changed, keeping earlier outputs', async () => {
    const r = rig();
    r.write('package-lock.json', 'one');
    r.script = [{ untracked: ['node_modules'] }];

    await r.prep.prepare(r.project, plan(install), BASE);
    await r.prep.prepare(r.project, plan(install), BASE);

    expect(r.calls).toHaveLength(1);

    r.write('package-lock.json', 'two');
    const out = await r.prep.prepare(r.project, plan(install), BASE);

    expect(r.calls).toHaveLength(2);
    expect(out.ok && out.prep.outputs).toEqual(['node_modules']);
  });

  it('reruns when the owner changes the steps or a missing input file appears', async () => {
    const r = rig();
    await r.prep.prepare(r.project, plan(install), BASE);

    await r.prep.prepare(
      r.project,
      plan({ ...install, command: 'npm ci --ignore-scripts' }),
      BASE,
    );

    r.write('package.json', '{}');
    await r.prep.prepare(
      r.project,
      plan({ ...install, command: 'npm ci --ignore-scripts' }),
      BASE,
    );

    expect(r.calls).toHaveLength(3);
  });

  it('expands a pattern in the last segment of an input, so a new requirements file changes the key', async () => {
    const r = rig();
    const pip = SetupStep.parse({
      name: 'Install',
      command: 'pip install',
      inputs: ['requirements*.txt'],
    });

    r.write('requirements.txt', 'a');
    await r.prep.prepare(r.project, plan(pip), BASE);

    r.write('requirements-dev.txt', 'b');
    await r.prep.prepare(r.project, plan(pip), BASE);

    expect(r.calls).toHaveLength(2);
  });
});
