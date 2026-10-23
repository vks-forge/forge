/**
 * Pins: the "Before each ticket" rules: detected steps become editable rows and back without
 * losing the parts the editor does not show, a save writes an explicit empty list for "No setup"
 * and no key at all for "use detected", the problems core would refuse are found while typing,
 * and a detected step names the file it came from.
 *
 * Why: saying nothing (follow detection) and saying "none" (no setup) are different settings with
 *   opposite effects on the next ticket, and a folder that escapes the repository must be refused
 *   beside the box, not by a ticket that fails to start (d-0176, d-0180).
 * Depends on: domain/setup-draft, domain/settings-draft, domain/settings-validate.
 */

import { SetupStep } from '@forge/core';
import { describe, expect, it } from 'vitest';
import {
  blankSetupRow,
  cacheLine,
  commandsLine,
  rowsFromSteps,
  setupIssues,
  setupSource,
  stepsFromRows,
} from '#/domain/setup-draft.js';
import { dirtyFields, docFromDraft, setOverridden } from '#/domain/settings-draft.js';
import { validateDraft } from '#/domain/settings-validate.js';
import type { SettingsDraft, SettingsSnapshot } from '#/types/project-settings.types.js';

const uv = SetupStep.parse({
  name: 'Install packages',
  command: 'uv sync --frozen',
  inputs: ['uv.lock'],
  path: ['.venv/bin'],
  env: { UV_CACHE_DIR: '.uv' },
  at_repo_root: true,
  timeout_minutes: 30,
  cache_env: { UV_CACHE_DIR: 'uv' },
  cache_outputs: ['node_modules'],
  toolchain: 'uv --version',
});

const row = (over: Partial<ReturnType<typeof blankSetupRow>> = {}) => ({
  ...blankSetupRow(),
  name: 'Install packages',
  command: 'uv sync',
  ...over,
});

describe('rows and steps', () => {
  it('round-trips a step, keeping the fields the editor does not show', () => {
    expect(stepsFromRows(rowsFromSteps([uv]))).toEqual([uv]);
  });

  it('carries cache_env, cache_outputs and toolchain through unchanged, so a save never erases them', () => {
    const [step] = stepsFromRows(rowsFromSteps([uv]));

    expect(step).toMatchObject({
      cache_env: { UV_CACHE_DIR: 'uv' },
      cache_outputs: ['node_modules'],
      toolchain: 'uv --version',
    });
  });

  it('clears only cache_outputs when the copy cache is switched off', () => {
    const [off] = rowsFromSteps([uv]).map((r) => ({ ...r, copy_cache: false }));
    const [step] = stepsFromRows([off as ReturnType<typeof blankSetupRow>]);

    expect(step).toMatchObject({
      cache_env: { UV_CACHE_DIR: 'uv' },
      cache_outputs: [],
      toolchain: 'uv --version',
    });
  });

  it('leaves out an empty folder and writes trimmed lists', () => {
    const [step] = stepsFromRows([
      row({ name: ' Install ', command: ' uv sync ', inputs: ' uv.lock \n\n', cwd: ' ' }),
    ]);

    expect(step).toMatchObject({
      name: 'Install',
      command: 'uv sync',
      inputs: ['uv.lock'],
    });

    expect(step).not.toHaveProperty('cwd');
  });

  it('names the file a detected step came from, or nothing when it has none', () => {
    expect(setupSource(uv)).toBe('from uv.lock');
    expect(setupSource({ inputs: [] })).toBeUndefined();
    expect(commandsLine([uv, { command: 'git submodule update --init' }])).toBe(
      'uv sync --frozen, git submodule update --init',
    );
  });
});

describe('cacheLine', () => {
  it('says what the step reuses', () => {
    expect(cacheLine(uv)).toBe('Cache: restores node_modules');
    expect(cacheLine(uv, false)).toBe('Downloads shared');
    expect(cacheLine({ cache_outputs: [], cache_env: { A: 'a' } })).toBe(
      'Downloads shared',
    );

    expect(cacheLine({ cache_outputs: [], cache_env: {} })).toBe('No cache');
  });
});

describe('setupIssues', () => {
  it('accepts a normal step', () => {
    expect(setupIssues([row()])).toEqual([]);
  });

  it('asks for a name and a command, and for unique names', () => {
    expect(setupIssues([row({ command: ' ' })])).toEqual([
      'Every setup step needs a name and a command.',
    ]);

    expect(setupIssues([row(), row()])).toEqual(['Setup step names must be unique.']);
  });

  it('refuses a folder outside the repository, for the step and for PATH', () => {
    for (const bad of [
      { cwd: '/etc' },
      { cwd: '..\\x' },
      { path: '.venv/bin\nC:\\tools' },
    ]) {
      expect(setupIssues([row(bad)])[0]).toMatch(/inside the repository/);
    }
  });

  it('bounds the time limit, the variable names and the number of steps', () => {
    expect(setupIssues([row({ timeout: '0' })])[0]).toMatch(/1 to 120/);
    expect(setupIssues([row({ timeout: 'soon' })])[0]).toMatch(/1 to 120/);
    expect(setupIssues([row({ timeout: '121' })])[0]).toMatch(/1 to 120/);
    expect(setupIssues([row({ pass_env: '9TOKEN' })])[0]).toMatch(/REGISTRY_TOKEN/);

    const many = Array.from({ length: 11 }, (_v, i) => row({ name: 's' + String(i) }));

    expect(setupIssues(many)[0]).toMatch(/at most 10/);
  });
});

describe('setup in the settings draft', () => {
  const snapshot = {
    override: {},
    company: { engine: { max_concurrent_per_project: 2, harness_fallbacks: [] } },
    config: { project: { checks: [], ecosystems: [], tier_c_globs: [] } },
  } as unknown as SettingsSnapshot;

  const draft = (setup: SettingsDraft['setup']): SettingsDraft =>
    ({
      checks: { overridden: false, value: [] },
      setup,
      ecosystems: { overridden: false, value: '' },
      default_harness: { overridden: false, value: '' },
      max_concurrent: { overridden: false, value: '' },
      harness_fallbacks: { overridden: false, value: '' },
      tier_c_globs: { overridden: false, value: '' },
      remote: { overridden: false, value: '' },
      director: { overridden: false, value: {} },
      research: {
        overridden: false,
        value: { enabled: true, deny_hosts: '', allow_hosts: '' },
      },
      revoked: [],
    }) as unknown as SettingsDraft;

  it('writes an empty list for "No setup" and no key for "use detected"', () => {
    expect(docFromDraft({}, draft({ overridden: true, value: [] }))).toEqual({
      setup: [],
    });

    expect(docFromDraft({ setup: [] }, draft({ overridden: false, value: [] }))).toEqual(
      {},
    );
  });

  it('marks the setup field unsaved when it differs from the saved version', () => {
    const changed = draft({ overridden: true, value: [] });

    expect(dirtyFields(snapshot, changed).has('setup')).toBe(true);
    expect(
      dirtyFields(snapshot, setOverridden(changed, snapshot, 'setup', false)).size,
    ).toBe(0);
  });

  it('blocks a save with a bad step, tied to the setup field, and ignores steps not overridden', () => {
    const bad = draft({ overridden: true, value: [row({ cwd: '/abs' })] });

    expect(validateDraft(bad, snapshot).map((issue) => issue.field)).toContain('setup');
    expect(
      validateDraft(
        draft({ overridden: false, value: [row({ cwd: '/abs' })] }),
        snapshot,
      ),
    ).toEqual([]);
  });
});
