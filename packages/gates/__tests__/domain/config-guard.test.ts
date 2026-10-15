/**
 * Gate-config guard tests — pin that the Worker cannot edit the rules it is judged by.
 *
 * Why: loosening eslint/vitest/tsconfig or the package.json script a gate runs makes the
 *   project checks pass without proving anything. The guard must catch those edits but
 *   not block unrelated package.json changes such as adding a dependency.
 *
 * Pins: each protected file name, package.json script matched through the commands
 *   (including pre hooks), unrelated package.json edits and source files passing.
 * Depends on: domain/config-guard, domain/patch, helpers/fixtures.
 */

import { describe, expect, it } from 'vitest';
import { checkGateConfig } from '#/domain/config-guard.js';
import { parsePatch } from '#/domain/patch.js';
import { checksOf, diffOf, patchFor } from '#tests/helpers/fixtures.js';

const COMMANDS = checksOf({ test: 'pnpm test', lint: 'npm run lint:ci' });

function run(path: string, added: string[] = [], removed: string[] = []) {
  const patch = patchFor(path, added, removed);

  return checkGateConfig(
    diffOf([{ status: 'M', path }], patch),
    parsePatch(patch),
    COMMANDS,
  );
}

describe('checkGateConfig', () => {
  it.each([
    'vitest.config.ts',
    'packages/a/jest.config.js',
    'eslint.config.js',
    '.eslintrc.json',
    'packages/a/tsconfig.test.json',
    '.prettierrc',
  ])('fails a change to %s', (path) => {
    expect(run(path).status).toBe('failed');
  });

  it('fails a changed script named by a project command, and its hooks', () => {
    const test = run('package.json', ['    "test": "echo ok"'], ['    "test": "vitest"']);
    const pre = run('package.json', ['    "pretest": "true"']);
    const ci = run('package.json', ['    "lint:ci": "true"']);

    expect(test.findings[0]?.message).toContain('script "test"');
    expect(pre.status).toBe('failed');
    expect(ci.status).toBe('failed');
  });

  it.each([
    'vite.config.ts',
    'vitest.workspace.ts',
    'vitest.setup.ts',
    'test/jest.setup.js',
    '.npmrc',
    '.yarnrc.yml',
    'pnpm-workspace.yaml',
    '.pnpmfile.cjs',
    '.eslintignore',
    '.prettierignore',
    '.gitattributes',
    'babel.config.js',
    '.babelrc.json',
    'Makefile',
    'justfile',
    'pyproject.toml',
    'setup.cfg',
    'tox.ini',
    'pytest.ini',
    'pkg/conftest.py',
  ])('fails a change to the widened guard list entry %s', (path) => {
    expect(run(path).status).toBe('failed');
  });

  it.each([
    'bin/pnpm.cmd',
    'x/run.BAT',
    'node.exe',
    'tools/a.ps1',
    'b.com',
    'sub/dir/Pnpm.CMD',
  ])('fails an added or modified executable %s anywhere in the diff', (path) => {
    const out = run(path);

    expect(out.status).toBe('failed');
    expect(out.findings[0]?.message).toContain('executable');
  });

  it('does not flag a deleted executable', () => {
    const patch = patchFor('old.exe', [], [], true);
    const out = checkGateConfig(
      diffOf([{ status: 'D', path: 'old.exe' }], patch),
      parsePatch(patch),
      COMMANDS,
    );

    expect(out.status).toBe('passed');
  });

  it.each([
    ['pnpm -r test', 'test'],
    ['pnpm --filter x test', 'test'],
    ['pnpm --filter=x run test', 'test'],
    ['pnpm -F pkg lint', 'lint'],
    ['pnpm --dir sub run lint', 'lint'],
    ['npm --prefix sub test', 'test'],
    ['npm -w pkg run build', 'build'],
    ['pnpm -w test', 'test'],
    ['yarn --cwd x test', 'test'],
    ['cd a && pnpm -C b run check', 'check'],
  ])('guards the script named by "%s" (%s), not its flags', (command, script) => {
    const out = checkGateConfig(
      diffOf([{ status: 'M', path: 'package.json' }], ''),
      parsePatch(patchFor('package.json', [`    "${script}": "true"`])),
      checksOf({ test: command }),
    );

    expect(out.status).toBe('failed');
  });

  it('does not treat a flag or its value as a script name', () => {
    const out = checkGateConfig(
      diffOf([{ status: 'M', path: 'package.json' }], ''),
      parsePatch(patchFor('package.json', ['    "filter": "x"', '    "-r": "x"'])),
      checksOf({ test: 'pnpm --filter x -r test' }),
    );

    expect(out.status).toBe('passed');
  });

  it('passes unrelated package.json and source edits', () => {
    const dep = run('package.json', ['    "zod": "4.6.7"']);
    const src = run('src/a.ts', ['const test = 1']);

    expect(dep.status).toBe('passed');
    expect(src.status).toBe('passed');
  });
});
