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

describe('checkGateConfig guards scripts a check command runs', () => {
  const guard = (command: string, path: string, status: 'M' | 'A' | 'D' = 'M') =>
    checkGateConfig(diffOf([{ status, path }], ''), [], checksOf({ test: command }));

  it.each([
    ['./scripts/test.sh', 'scripts/test.sh'],
    ['./gradlew test', 'gradlew'],
    ['./gradlew.bat test', 'gradlew.bat'],
    ['./mvnw verify', 'mvnw'],
    ['mvnw.cmd verify', 'mvnw.cmd'],
    ['bin/test', 'bin/test'],
    ['bash scripts/check.sh --fast', 'scripts/check.sh'],
    ['cd app && ./ci/run.sh', 'ci/run.sh'],
    ['node scripts/lint.mjs', 'scripts/lint.mjs'],
    ['node scripts/lint.cjs --fix', 'scripts/lint.cjs'],
    ['node lint.js', 'lint.js'],
    ['python scripts/check.py', 'scripts/check.py'],
    ['python3 -u check.py', 'check.py'],
    ['ruby scripts/check.rb', 'scripts/check.rb'],
    ['php scripts/check.php', 'scripts/check.php'],
    ['perl scripts/check.pl', 'scripts/check.pl'],
    ['bun run scripts/check.ts', 'scripts/check.ts'],
    ['node --import ./hooks/setup.mjs --test', 'hooks/setup.mjs'],
    ['pytest -c tools/pytest.ini', 'tools/pytest.ini'],
    ['"python" "scripts/check.py"', 'scripts/check.py'],
    ['.\\scripts\\test.ps1', 'scripts/test.ps1'],
  ])('a check "%s" makes edits to %s a finding', (command, path) => {
    const out = guard(command, path);

    expect(out.status).toBe('failed');
    expect(out.findings[0]?.message).toContain('run by a project check');
  });

  it('a check cwd prefixes the script it runs', () => {
    const out = checkGateConfig(
      diffOf([{ status: 'M', path: 'tools/scripts/lint.mjs' }], ''),
      [],
      [{ name: 'lint', role: 'lint', command: 'node scripts/lint.mjs', cwd: 'tools' }],
    );

    expect(out.status).toBe('failed');
  });

  it('a deleted guarded script is a finding too', () => {
    expect(guard('./scripts/test.sh', 'scripts/test.sh', 'D').status).toBe('failed');
  });

  it.each([
    ['./scripts/test.sh', 'scripts/other.sh'],
    ['./scripts/test.sh', 'src/a.ts'],
    ['pytest', 'tests/test_a.py'],
    ['pnpm test', 'scripts/test.sh'],
    ['/usr/bin/make test', 'usr/bin/make'],
    ['../outside/test.sh', 'outside/test.sh'],
    ['node ../outside/lint.mjs', 'outside/lint.mjs'],
    ['node /abs/lint.mjs', 'abs/lint.mjs'],
    ['node scripts/lint.mjs', 'scripts/other.mjs'],
  ])('a check "%s" does not guard %s', (command, path) => {
    expect(guard(command, path).status).toBe('passed');
  });
});

describe('checkGateConfig on a project with no checks (d-0173)', () => {
  const NONE = checksOf({});

  function runWith(
    checks: typeof NONE,
    files: readonly { status: 'A' | 'M' | 'D' | 'R'; path: string }[],
  ) {
    const patch = files.map((f) => patchFor(f.path, ['x'])).join('');

    return checkGateConfig(diffOf(files, patch), parsePatch(patch), checks);
  }

  const SCAFFOLD = [
    { status: 'A', path: 'tsconfig.json' },
    { status: 'A', path: 'vitest.config.ts' },
    { status: 'A', path: 'eslint.config.mjs' },
  ] as const;

  it('allows added config files and says which and why', () => {
    const out = runWith(NONE, SCAFFOLD);

    expect(out.status).toBe('passed');
    expect(out.findings).toEqual([]);
    expect(out.details).toContain('tsconfig.json, vitest.config.ts, eslint.config.mjs');
    expect(out.details).toContain('no project checks are configured yet');
    expect(out.details).toContain('nothing to loosen');
  });

  it('fails the same added files once the project has checks', () => {
    const out = runWith(COMMANDS, SCAFFOLD);

    expect(out.status).toBe('failed');
    expect(out.findings.map((f) => f.file)).toEqual([
      'tsconfig.json',
      'vitest.config.ts',
      'eslint.config.mjs',
    ]);
  });

  it.each(['M', 'D'] as const)('still fails a config file with status %s', (status) => {
    const out = runWith(NONE, [{ status, path: 'vitest.config.ts' }]);

    expect(out.status).toBe('failed');
    expect(out.findings[0]).toMatchObject({
      check: 'gate-config',
      file: 'vitest.config.ts',
    });
  });

  it('still fails a renamed config file', () => {
    const out = runWith(NONE, [{ status: 'R', path: 'vitest.config.ts' }]);

    expect(out.status).toBe('failed');
  });

  it('still fails a planted executable even when the config around it is allowed', () => {
    const out = runWith(NONE, [...SCAFFOLD, { status: 'A', path: 'pnpm.cmd' }]);

    expect(out.status).toBe('failed');
    expect(out.findings.map((f) => f.file)).toEqual(['pnpm.cmd']);
  });

  it('still fails an added .gitattributes, which hides hunks from the diff', () => {
    const out = runWith(NONE, [{ status: 'A', path: '.gitattributes' }]);

    expect(out.status).toBe('failed');
  });
});
