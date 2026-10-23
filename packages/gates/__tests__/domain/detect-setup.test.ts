/**
 * Tests for `detectSetup`, the default worktree setup steps per ecosystem.
 *
 * Why: before a Worker starts, Forge installs the project's dependencies for whatever language
 *   the project uses (d-0176, d-0180). A wrong row installs with the wrong tool or, worse, makes
 *   a Python project run `npm`; a project with no package manager (CMake, Maven, a networking
 *   repo) must get no setup and no error. Each recipe row is pinned here, together with the
 *   rules that choose between rows: a lockfile beats a bare manifest, the project folder beats
 *   the repository top, and a monorepo subfolder uses the monorepo's lockfile.
 *
 * Pins: every row of the recipe table, "no setup" for repos without a recipe, lockfile
 *   precedence, repository-top fallback with `at_repo_root`, submodules at the repository top,
 *   several ecosystems in one repo in run order, unique step names, and that every recipe parses
 *   as a valid `SetupStep`.
 * Depends on: domain/detect-setup, domain/ecosystems/setup-recipes, @forge/core (SetupStep), vitest.
 */

import { SetupStep } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { detectSetup } from '#/domain/detect-setup.js';
import { SETUP_RECIPES } from '#/domain/ecosystems/setup-recipes.js';

const commands = (entries: string[], repoEntries?: string[]): string[] =>
  detectSetup({
    projectEntries: entries,
    ...(repoEntries === undefined ? {} : { repoEntries }),
  }).map((s) => s.command);

describe('detectSetup rows', () => {
  it.each([
    [['pnpm-lock.yaml', 'package.json'], ['pnpm install --frozen-lockfile']],
    [['yarn.lock', '.yarnrc.yml', 'package.json'], ['yarn install --immutable']],
    [['yarn.lock', 'package.json'], ['yarn install --frozen-lockfile']],
    [['bun.lockb', 'package.json'], ['bun install --frozen-lockfile']],
    [['bun.lock', 'package.json'], ['bun install --frozen-lockfile']],
    [['package-lock.json', 'package.json'], ['npm ci --no-audit --no-fund']],
    [['npm-shrinkwrap.json', 'package.json'], ['npm ci --no-audit --no-fund']],
    [['package.json'], ['npm install --no-package-lock --no-audit --no-fund']],
    [['uv.lock', 'pyproject.toml'], ['uv sync --frozen']],
    [['poetry.lock', 'pyproject.toml'], ['poetry install --no-interaction']],
    [['Pipfile.lock', 'Pipfile'], ['pipenv sync']],
    [
      ['requirements.txt'],
      ['python -m venv .venv', 'python -m pip install -r requirements.txt'],
    ],
    [['pyproject.toml'], ['python -m venv .venv', 'python -m pip install -e .']],
    [['go.mod', 'go.sum'], ['go mod download']],
    [['Cargo.toml', 'Cargo.lock'], ['cargo fetch --locked']],
    [['Cargo.toml'], ['cargo fetch']],
    [['app.sln', 'packages.lock.json'], ['dotnet restore --locked-mode']],
    [['app.csproj'], ['dotnet restore']],
    [['Gemfile', 'Gemfile.lock'], ['bundle install']],
    [['Gemfile'], ['bundle install']],
    [
      ['composer.json', 'composer.lock'],
      ['composer install --no-interaction --no-progress'],
    ],
    [['composer.json'], ['composer install --no-interaction --no-progress']],
  ])('%j gives %j', (entries, expected) => {
    expect(commands(entries)).toEqual(expected);
  });

  it.each([
    [
      'a Java project (dependencies are fetched while the check builds)',
      ['pom.xml', 'src'],
    ],
    ['a Gradle project', ['build.gradle.kts', 'gradlew']],
    ['a CMake project', ['CMakeLists.txt', 'main.cpp']],
    [
      'a networking or config repo with no package manager',
      ['inventory.yml', 'README.md'],
    ],
    ['an empty folder', []],
  ])('gives no setup for %s', (_label, entries) => {
    expect(detectSetup({ projectEntries: entries })).toEqual([]);
  });

  it('matches marker names regardless of case', () => {
    expect(commands(['PNPM-LOCK.YAML', 'Package.json'])).toEqual([
      'pnpm install --frozen-lockfile',
    ]);
  });

  it('puts the virtual environment on PATH for a Python setup and sets the tool env', () => {
    const steps = detectSetup({ projectEntries: ['poetry.lock'] });

    expect(steps[0]?.path).toEqual(['.venv/Scripts', '.venv/bin']);
    expect(steps[0]?.env).toEqual({ POETRY_VIRTUALENVS_IN_PROJECT: 'true' });
  });

  it('lists the files whose change means the install must run again', () => {
    const [step] = detectSetup({ projectEntries: ['pnpm-lock.yaml'] });

    expect(step?.inputs).toEqual([
      'pnpm-lock.yaml',
      'package.json',
      'pnpm-workspace.yaml',
    ]);
  });
});

describe('detectSetup choosing between folders and rows', () => {
  it('prefers a lockfile row over a bare manifest even when the manifest is nearer', () => {
    expect(commands(['package.json'], ['pnpm-lock.yaml', 'package.json'])).toEqual([
      'pnpm install --frozen-lockfile',
    ]);
  });

  it('runs the monorepo install at the repository top for a subfolder project', () => {
    const [step] = detectSetup({
      projectEntries: ['package.json', 'src'],
      repoEntries: ['pnpm-lock.yaml', 'package.json', 'apps'],
    });

    expect(step).toMatchObject({
      at_repo_root: true,
      command: 'pnpm install --frozen-lockfile',
    });
  });

  it("prefers the project folder's own lockfile over the repository top's", () => {
    const [step] = detectSetup({
      projectEntries: ['package-lock.json', 'package.json'],
      repoEntries: ['yarn.lock', 'package.json'],
    });

    expect(step?.command).toBe('npm ci --no-audit --no-fund');
    expect(step?.at_repo_root).toBeUndefined();
  });

  it('fetches submodules at the repository top, whichever folder the project is', () => {
    const steps = detectSetup({
      projectEntries: ['package-lock.json'],
      repoEntries: ['.gitmodules', 'sub'],
    });

    expect(steps.map((s) => [s.command, s.at_repo_root])).toEqual([
      ['git submodule update --init --recursive', true],
      ['npm ci --no-audit --no-fund', undefined],
    ]);
  });

  it('fetches submodules without at_repo_root when the project is the repository top', () => {
    const [step] = detectSetup({ projectEntries: ['.gitmodules'] });

    expect(step?.at_repo_root).toBeUndefined();
  });

  it('sets up every ecosystem it finds, in table order, with unique step names', () => {
    const steps = detectSetup({
      projectEntries: [
        'go.mod',
        'package-lock.json',
        'requirements.txt',
        'composer.json',
      ],
    });

    expect(steps.map((s) => s.command)).toEqual([
      'npm ci --no-audit --no-fund',
      'python -m venv .venv',
      'python -m pip install -r requirements.txt',
      'go mod download',
      'composer install --no-interaction --no-progress',
    ]);

    expect(new Set(steps.map((s) => s.name)).size).toBe(steps.length);
  });
});

describe('SETUP_RECIPES', () => {
  it('holds only steps that are valid SetupSteps with no folder escape', () => {
    for (const recipe of SETUP_RECIPES) {
      for (const step of recipe.steps) {
        expect(SetupStep.safeParse(step).success, `${recipe.id}: ${step.name}`).toBe(
          true,
        );
      }
    }
  });

  it('has a unique id per row', () => {
    const ids = SETUP_RECIPES.map((r) => r.id);

    expect(new Set(ids).size).toBe(ids.length);
  });
});
