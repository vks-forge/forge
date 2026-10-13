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
import { diffOf, patchFor } from '#tests/helpers/fixtures.js';

const COMMANDS = { test: 'pnpm test', lint: 'npm run lint:ci' };

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

  it('passes unrelated package.json and source edits', () => {
    const dep = run('package.json', ['    "zod": "4.6.7"']);
    const src = run('src/a.ts', ['const test = 1']);

    expect(dep.status).toBe('passed');
    expect(src.status).toBe('passed');
  });
});
