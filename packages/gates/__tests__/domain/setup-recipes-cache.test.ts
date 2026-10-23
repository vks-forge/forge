/**
 * Tests for the dependency-cache data in the setup recipe table.
 *
 * Why: which folders are safe to share or copy is ecosystem knowledge, and a wrong row is costly:
 *   copying a Python virtual environment (it holds absolute paths) yields a tree that looks
 *   installed and fails at run time, and a missing download-cache variable silently loses the
 *   speed-up for a whole language. The table is the only place this knowledge lives (d-0176), so
 *   each row's variables and copyable outputs are pinned here.
 *
 * Pins: cache_env per tool, copyable outputs only for npm, yarn classic, bun and composer, no
 *   Python step ever has cache_outputs, every cache_env folder and output is a valid relative
 *   path, every cache_outputs step has a toolchain probe, and a recipe that sets cache_env stays
 *   inside a per-ecosystem folder.
 * Depends on: domain/ecosystems/setup-recipes, vitest.
 */

import { describe, expect, it } from 'vitest';
import { SETUP_RECIPES } from '#/domain/ecosystems/setup-recipes.js';

const row = (id: string) => SETUP_RECIPES.find((r) => r.id === id)!;
const installOf = (id: string) => row(id).steps[row(id).steps.length - 1]!;

describe('cache_env per tool', () => {
  it.each([
    ['npm', { npm_config_cache: 'node/npm' }],
    ['npm-no-lockfile', { npm_config_cache: 'node/npm' }],
    ['pnpm', { npm_config_store_dir: 'node/pnpm' }],
    ['yarn', { YARN_CACHE_FOLDER: 'node/yarn' }],
    ['yarn-berry', { YARN_CACHE_FOLDER: 'node/yarn' }],
    ['bun', { BUN_INSTALL_CACHE_DIR: 'node/bun' }],
    ['uv', { UV_CACHE_DIR: 'python/uv' }],
    ['poetry', { POETRY_CACHE_DIR: 'python/poetry', PIP_CACHE_DIR: 'python/pip' }],
    ['pipenv', { PIPENV_CACHE_DIR: 'python/pipenv', PIP_CACHE_DIR: 'python/pip' }],
    ['pip-requirements', { PIP_CACHE_DIR: 'python/pip' }],
    ['pip-pyproject', { PIP_CACHE_DIR: 'python/pip' }],
    ['go', { GOMODCACHE: 'go/mod' }],
    ['dotnet-locked', { NUGET_PACKAGES: 'dotnet/nuget' }],
    ['dotnet', { NUGET_PACKAGES: 'dotnet/nuget' }],
    ['composer', { COMPOSER_CACHE_DIR: 'php/composer' }],
  ])('%s', (id, env) => {
    expect(installOf(id).cache_env).toEqual(env);
  });

  it('leaves tools with nothing safe to share alone (git submodules, Bundler, Cargo)', () => {
    for (const id of [
      'git-submodules',
      'bundler',
      'bundler-locked',
      'cargo-locked',
      'cargo',
    ]) {
      expect(installOf(id).cache_env ?? {}).toEqual({});
    }
  });
});

describe('cache_outputs', () => {
  it.each([
    ['npm', ['node_modules']],
    ['yarn', ['node_modules']],
    ['bun', ['node_modules']],
    ['composer', ['vendor']],
  ])('%s restores %j', (id, outputs) => {
    expect(installOf(id).cache_outputs).toEqual(outputs);
  });

  it('never marks a Python step (virtual environments are not relocatable)', () => {
    for (const r of SETUP_RECIPES.filter((x) => x.ecosystem === 'python')) {
      for (const s of r.steps) {
        expect(s.cache_outputs ?? []).toEqual([]);
      }
    }
  });

  it('only marks node_modules for tools whose layout copies safely (not pnpm, not Yarn Berry)', () => {
    for (const id of ['pnpm', 'yarn-berry', 'npm-no-lockfile']) {
      expect(installOf(id).cache_outputs ?? []).toEqual([]);
    }
  });

  it('gives every copyable step a toolchain probe', () => {
    for (const r of SETUP_RECIPES) {
      for (const s of r.steps.filter((x) => (x.cache_outputs ?? []).length > 0)) {
        expect(s.toolchain, r.id).toBeTruthy();
      }
    }
  });

  it('keeps every cache folder inside a per-ecosystem folder', () => {
    for (const r of SETUP_RECIPES) {
      for (const s of r.steps) {
        for (const folder of Object.values(s.cache_env ?? {})) {
          expect(folder, r.id).toMatch(new RegExp(`^${r.ecosystem}/[a-z-]+$`));
        }
      }
    }
  });
});
