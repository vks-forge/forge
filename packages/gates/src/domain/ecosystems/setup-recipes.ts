/**
 * Setup recipes — per ecosystem, the steps that make a fresh worktree ready for its checks.
 *
 * Why: Workers may not install packages, so Forge installs before a Worker starts (d-0180),
 *   and it serves projects in any language (d-0176): `node_modules`, `.venv`, `vendor/`, the Go
 *   or Cargo module cache. What to run is therefore data keyed by the files that identify the
 *   tool, never an `if` in the engine. Installs are frozen (lockfile as written) so a setup
 *   never rewrites the lockfile into the Worker's diff; a folder with a manifest but no lockfile
 *   gets the variant that writes none where the tool has one. `inputs` are the files whose
 *   content decides whether the step must run again. These are the defaults; the owner overrides
 *   them in project settings. Adding an ecosystem is one row here.
 *
 *   Reuse is data too. `cache_env` points the tool's own download cache at a Forge folder shared by
 *   every worktree (safe everywhere; nothing is relocated). `cache_outputs` lists install folders
 *   that survive being copied to another worktree (`node_modules` of npm, yarn classic and bun;
 *   `vendor`), with a `toolchain` probe whose output joins the cache key. Left out on purpose:
 *   Python virtual environments (they hold absolute paths), pnpm's `node_modules` (workspace
 *   packages keep their own beside the sources), .NET `obj/`, and Bundler (its install path is
 *   outside the project and a variable set only for the install would send the gems elsewhere
 *   than the checks look).
 *
 *   No row, on purpose: Maven and Gradle fetch dependencies while the check builds, and C/C++
 *   (CMake, make) has no package step. A project with none of these markers gets no setup.
 *
 * Exports: SETUP_RECIPES.
 * Depends on: domain/ecosystems/setup-recipes-python, types/setup. No IO.
 */

import { PYTHON_RECIPES } from '#/domain/ecosystems/setup-recipes-python.js';
import type { SetupRecipe } from '#/types/setup.types.js';

/** Rows in run order; within an ecosystem the first matching row wins (see `fallback`). */
export const SETUP_RECIPES: readonly SetupRecipe[] = [
  {
    ecosystem: 'any',
    id: 'git-submodules',
    any: ['.gitmodules'],
    repoTop: true,
    steps: [
      {
        name: 'Fetch submodules',
        command: 'git submodule update --init --recursive',
        inputs: ['.gitmodules'],
      },
    ],
  },

  {
    ecosystem: 'node',
    id: 'pnpm',
    any: ['pnpm-lock.yaml'],
    steps: [
      {
        name: 'Install packages',
        command: 'pnpm install --frozen-lockfile',
        cache_env: { npm_config_store_dir: 'node/pnpm' },
        inputs: ['pnpm-lock.yaml', 'package.json', 'pnpm-workspace.yaml'],
      },
    ],
  },
  {
    ecosystem: 'node',
    id: 'yarn-berry',
    any: ['yarn.lock'],
    all: ['.yarnrc.yml'],
    steps: [
      {
        name: 'Install packages',
        command: 'yarn install --immutable',
        cache_env: { YARN_CACHE_FOLDER: 'node/yarn' },
        inputs: ['yarn.lock', 'package.json', '.yarnrc.yml'],
      },
    ],
  },
  {
    ecosystem: 'node',
    id: 'yarn',
    any: ['yarn.lock'],
    steps: [
      {
        name: 'Install packages',
        command: 'yarn install --frozen-lockfile',
        cache_env: { YARN_CACHE_FOLDER: 'node/yarn' },
        cache_outputs: ['node_modules'],
        toolchain: 'node --version && yarn --version',
        inputs: ['yarn.lock', 'package.json'],
      },
    ],
  },
  {
    ecosystem: 'node',
    id: 'bun',
    any: ['bun.lock', 'bun.lockb'],
    steps: [
      {
        name: 'Install packages',
        command: 'bun install --frozen-lockfile',
        cache_env: { BUN_INSTALL_CACHE_DIR: 'node/bun' },
        cache_outputs: ['node_modules'],
        toolchain: 'bun --version',
        inputs: ['bun.lock', 'bun.lockb', 'package.json'],
      },
    ],
  },
  {
    ecosystem: 'node',
    id: 'npm',
    any: ['package-lock.json', 'npm-shrinkwrap.json'],
    steps: [
      {
        name: 'Install packages',
        command: 'npm ci --no-audit --no-fund',
        cache_env: { npm_config_cache: 'node/npm' },
        cache_outputs: ['node_modules'],
        toolchain: 'node --version && npm --version',
        inputs: ['package-lock.json', 'npm-shrinkwrap.json', 'package.json'],
      },
    ],
  },
  {
    ecosystem: 'node',
    id: 'npm-no-lockfile',
    any: ['package.json'],
    fallback: true,
    steps: [
      {
        name: 'Install packages',
        command: 'npm install --no-package-lock --no-audit --no-fund',
        cache_env: { npm_config_cache: 'node/npm' },
        inputs: ['package.json'],
      },
    ],
  },

  ...PYTHON_RECIPES,

  {
    ecosystem: 'go',
    id: 'go',
    any: ['go.mod'],
    steps: [
      {
        name: 'Download Go modules',
        command: 'go mod download',
        cache_env: { GOMODCACHE: 'go/mod' },
        inputs: ['go.mod', 'go.sum'],
      },
    ],
  },

  {
    ecosystem: 'rust',
    id: 'cargo-locked',
    any: ['Cargo.lock'],
    steps: [
      {
        name: 'Fetch Rust crates',
        command: 'cargo fetch --locked',
        inputs: ['Cargo.toml', 'Cargo.lock'],
      },
    ],
  },
  {
    ecosystem: 'rust',
    id: 'cargo',
    any: ['Cargo.toml'],
    fallback: true,
    steps: [
      { name: 'Fetch Rust crates', command: 'cargo fetch', inputs: ['Cargo.toml'] },
    ],
  },

  {
    ecosystem: 'dotnet',
    id: 'dotnet-locked',
    any: ['packages.lock.json'],
    steps: [
      {
        name: 'Restore .NET packages',
        command: 'dotnet restore --locked-mode',
        cache_env: { NUGET_PACKAGES: 'dotnet/nuget' },
        inputs: ['packages.lock.json', '*.csproj', '*.sln'],
      },
    ],
  },
  {
    ecosystem: 'dotnet',
    id: 'dotnet',
    any: ['*.sln', '*.csproj'],
    fallback: true,
    steps: [
      {
        name: 'Restore .NET packages',
        command: 'dotnet restore',
        cache_env: { NUGET_PACKAGES: 'dotnet/nuget' },
        inputs: ['*.csproj', '*.sln'],
      },
    ],
  },

  {
    ecosystem: 'ruby',
    id: 'bundler-locked',
    any: ['Gemfile.lock'],
    steps: [
      {
        name: 'Install gems',
        command: 'bundle install',
        env: { BUNDLE_FROZEN: 'true' },
        inputs: ['Gemfile', 'Gemfile.lock'],
      },
    ],
  },
  {
    ecosystem: 'ruby',
    id: 'bundler',
    any: ['Gemfile'],
    fallback: true,
    steps: [{ name: 'Install gems', command: 'bundle install', inputs: ['Gemfile'] }],
  },

  {
    ecosystem: 'php',
    id: 'composer',
    any: ['composer.lock', 'composer.json'],
    steps: [
      {
        name: 'Install PHP packages',
        command: 'composer install --no-interaction --no-progress',
        cache_env: { COMPOSER_CACHE_DIR: 'php/composer' },
        cache_outputs: ['vendor'],
        toolchain: 'php --version && composer --version',
        inputs: ['composer.json', 'composer.lock'],
      },
    ],
  },
];
