/**
 * Tests for the preparer's dependency cache: shared download folders and restored installs.
 *
 * Why: an install takes 80 to 230 seconds and every ticket of a project repeats it. The preparer
 *   reuses work two ways (download folders shared through the step's `cache_env`; install folders
 *   copied back when an identical step already ran) and must do so without ever costing a ticket:
 *   a different lockfile or toolchain must reinstall, a Python-style step with no relocatable
 *   output must never be copied, secrets must stay out of the step environment, and a broken cache
 *   folder must mean "run the step as usual", never a failure.
 *
 * Pins: first run probes the toolchain, runs, stores; second worktree with the same inputs
 *   restores and runs no install command and records `restored`; changed lockfile or toolchain
 *   misses; `cache_env` points at `<cache>/downloads/...` for that step only; a step without
 *   `cache_outputs` is not probed or stored; no `cacheDir` changes nothing; an unusable cache
 *   folder still lets the step run.
 * Depends on: helpers/prep-rig, @forge/core (SetupStep), node:fs, node:os, node:path, vitest.
 */

import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SetupStep } from '@forge/core';
import { afterEach, describe, expect, it } from 'vitest';
import { useRigs } from '#tests/helpers/prep-rig.js';

const rig = useRigs();
const BASE = { baseSha: 'b'.repeat(40) };

const caches: string[] = [];
afterEach(() => {
  for (const c of caches.splice(0)) {
    rmSync(c, { recursive: true, force: true });
  }
});

const cacheDir = (): string => {
  const c = mkdtempSync(join(tmpdir(), 'forge cachedir '));
  caches.push(c);

  return c;
};

const install = SetupStep.parse({
  name: 'Install packages',
  command: 'npm ci',
  inputs: ['package-lock.json'],
  cache_env: { npm_config_cache: 'node/npm' },
  cache_outputs: ['node_modules'],
  toolchain: 'node --version',
});

const plan = (...steps: SetupStep[]) => ({ steps, source: 'settings' as const });
const PROBE = { result: { output: 'v22.1.0\n' } };
const INSTALL = { makes: ['node_modules'] };

describe('restore from the copy cache', () => {
  it('runs the first install, then restores the second worktree without running it', async () => {
    const cache = cacheDir();
    const a = rig({ cacheDir: cache });
    a.write('package-lock.json', 'lock');
    a.script.push(PROBE, INSTALL);

    const first = await a.prep.prepare(a.project, plan(install), BASE);
    await a.settle();

    expect(first.ok && first.prep.steps[0]?.restored).toBeFalsy();
    expect(a.calls.map((c) => c.command)).toEqual(['node --version', 'npm ci']);

    const b = rig({ cacheDir: cache });
    b.write('package-lock.json', 'lock');
    b.script.push(PROBE);

    const second = await b.prep.prepare(b.project, plan(install), BASE);

    expect(b.calls.map((c) => c.command)).toEqual(['node --version']);
    expect(existsSync(join(b.project, 'node_modules'))).toBe(true);
    expect(second.ok && second.prep.steps[0]).toMatchObject({
      restored: true,
      exit_code: 0,
    });
  });

  it('reinstalls when the lockfile differs', async () => {
    const cache = cacheDir();
    const a = rig({ cacheDir: cache });
    a.write('package-lock.json', 'lock-1');
    a.script.push(PROBE, INSTALL);
    await a.prep.prepare(a.project, plan(install), BASE);
    await a.settle();

    const b = rig({ cacheDir: cache });
    b.write('package-lock.json', 'lock-2');
    b.script.push(PROBE, INSTALL);
    await b.prep.prepare(b.project, plan(install), BASE);

    expect(b.calls.map((c) => c.command)).toEqual(['node --version', 'npm ci']);
  });

  it('reinstalls when the toolchain differs', async () => {
    const cache = cacheDir();
    const a = rig({ cacheDir: cache });
    a.write('package-lock.json', 'lock');
    a.script.push(PROBE, INSTALL);
    await a.prep.prepare(a.project, plan(install), BASE);
    await a.settle();

    const b = rig({ cacheDir: cache });
    b.write('package-lock.json', 'lock');
    b.script.push({ result: { output: 'v24.0.0' } }, INSTALL);
    await b.prep.prepare(b.project, plan(install), BASE);

    expect(b.calls.map((c) => c.command)).toEqual(['node --version', 'npm ci']);
  });

  it('does not cache when the toolchain probe fails (the step still runs)', async () => {
    const cache = cacheDir();
    const a = rig({ cacheDir: cache });
    a.write('package-lock.json', 'lock');
    a.script.push({ result: { exitCode: 127 } }, INSTALL);

    const out = await a.prep.prepare(a.project, plan(install), BASE);
    await a.settle();

    expect(out.ok).toBe(true);
    expect(a.stores).toHaveLength(0);
  });
});

describe('shared download folders', () => {
  it('sets cache_env under the cache folder for that step only', async () => {
    const cache = cacheDir();
    const a = rig({ cacheDir: cache, env: { npm_config_cache: 'server-value' } });
    const other = SetupStep.parse({ name: 'Other', command: 'echo hi' });
    a.script.push(PROBE);

    await a.prep.prepare(a.project, plan(install, other), BASE);

    const env = a.calls.find((c) => c.command === 'npm ci')?.env ?? {};
    expect(env['npm_config_cache']).toBe(join(cache, 'downloads', 'node', 'npm'));
    expect(
      a.calls.find((c) => c.command === 'echo hi')?.env['npm_config_cache'],
    ).toBeUndefined();
  });

  it('does not probe, copy or store a step with no cache_outputs (a Python-style install)', async () => {
    const cache = cacheDir();
    const a = rig({ cacheDir: cache });
    const py = SetupStep.parse({
      name: 'Install Python packages',
      command: 'uv sync --frozen',
      cache_env: { UV_CACHE_DIR: 'python/uv' },
    });

    await a.prep.prepare(a.project, plan(py), BASE);
    await a.settle();

    expect(a.calls.map((c) => c.command)).toEqual(['uv sync --frozen']);
    expect(a.calls[0]?.env['UV_CACHE_DIR']).toBe(
      join(cache, 'downloads', 'python', 'uv'),
    );

    expect(a.stores).toHaveLength(0);
  });

  it('changes nothing without a cache folder', async () => {
    const a = rig();
    a.script.push({});

    await a.prep.prepare(a.project, plan(install), BASE);

    expect(a.calls.map((c) => c.command)).toEqual(['npm ci']);
    expect(a.calls[0]?.env['npm_config_cache']).toBeUndefined();
  });
});

describe('a broken cache never fails the step', () => {
  it('runs the step normally when the cache folder is a file', async () => {
    const dir = cacheDir();
    const file = join(dir, 'not-a-folder');
    writeFileSync(file, 'x');
    const a = rig({ cacheDir: file });
    a.write('package-lock.json', 'lock');
    a.script.push(PROBE, INSTALL);

    const out = await a.prep.prepare(a.project, plan(install), BASE);
    await a.settle();

    expect(out.ok).toBe(true);
    expect(a.calls.map((c) => c.command)).toContain('npm ci');
    expect(
      a.calls.find((c) => c.command === 'npm ci')?.env['npm_config_cache'],
    ).toBeUndefined();
  });
});
