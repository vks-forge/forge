/**
 * Per-ecosystem gate rule tests — pin what each language's rule data guards.
 *
 * Why: G1 must catch the same cheating in any language: editing the lint or test
 *   configuration, deleting or silencing a test, claiming a test that does not exist.
 *   Each ecosystem has its own file names and skip markers, so one wrong glob is a
 *   language where the gate silently passes. These cases pin the data per ecosystem, the
 *   detection that picks it, and the project override that adjusts it (d-0095).
 *
 * Pins: detection from paths and commands, explicit ecosystems, fail-closed fallback to
 *   all, gate_rules add and replace, config-guard files per ecosystem.
 * Depends on: domain/gate-rules, domain/config-guard, domain/test-files, domain/patch, helpers/fixtures. No IO.
 */

import { describe, expect, it } from 'vitest';
import { checkGateConfig } from '#/domain/config-guard.js';
import { detectEcosystems, resolveRules } from '#/domain/gate-rules.js';
import { parsePatch } from '#/domain/patch.js';
import { isTestFile } from '#/domain/test-files.js';
import { checksOf, diffOf, patchFor } from '#tests/helpers/fixtures.js';

const none = { ecosystems: [], checks: [], gate_rules: undefined };

function configFindings(path: string, ecosystems: string[] = []): number {
  const patch = patchFor(path, ['x']);
  const rules = resolveRules({ ...none, ecosystems }, [path]);

  return checkGateConfig(
    diffOf([{ status: 'M', path }], patch),
    parsePatch(patch),
    [],
    rules,
  ).findings.length;
}

describe('detectEcosystems', () => {
  it('reads ecosystems from changed paths', () => {
    expect(detectEcosystems(['src/a.ts'])).toEqual(['node']);
    expect(detectEcosystems(['app/calc.py', 'cmd/main.go'])).toEqual(['python', 'go']);
    expect(detectEcosystems(['Cargo.toml'])).toEqual(['rust']);
    expect(detectEcosystems(['src/Main.java', 'App.Tests/FooTests.cs'])).toEqual([
      'jvm',
      'dotnet',
    ]);

    expect(detectEcosystems(['a.rb', 'b.php', 'CMakeLists.txt'])).toEqual([
      'ruby',
      'php',
      'cmake',
    ]);
  });

  it('reads ecosystems from the first word of check commands', () => {
    expect(detectEcosystems([], ['cargo test', './gradlew check'])).toEqual([
      'rust',
      'jvm',
    ]);
  });

  it('finds nothing in a path no ecosystem knows', () => {
    expect(detectEcosystems(['docs/readme.txt'])).toEqual([]);
  });
});

describe('resolveRules', () => {
  it('uses the ecosystems the project names, whatever the diff holds', () => {
    const r = resolveRules({ ...none, ecosystems: ['go'] }, ['a.py']);

    expect(r.ecosystems).toEqual(['go']);
  });

  it('detects from paths and commands when the project names none', () => {
    const r = resolveRules({ ...none, checks: checksOf({ test: 'cargo test' }) }, [
      'web/app.ts',
    ]);

    expect(r.ecosystems).toEqual(['node', 'rust']);
  });

  it('falls back to every ecosystem when nothing says which (fail closed)', () => {
    expect(resolveRules(none, ['docs/readme.txt']).ecosystems).toHaveLength(9);
    expect(resolveRules({ ...none, ecosystems: ['elixir'] }, []).ecosystems).toHaveLength(
      9,
    );
  });

  it('adds project globs and skip patterns to the ecosystem data', () => {
    const r = resolveRules(
      {
        ...none,
        ecosystems: ['go'],
        gate_rules: {
          config_globs: ['ci/lint.sh'],
          test_globs: ['e2e/**'],
          skip_patterns: ['\\bFLAKY\\b'],
          replace: false,
        },
      },
      [],
    );

    expect(isTestFile('pkg/a_test.go', r)).toBe(true);
    expect(isTestFile('e2e/login.txt', r)).toBe(true);
    expect(r.configGlobs).toContain('.golangci.yml');
    expect(r.configGlobs).toContain('ci/lint.sh');
    expect(r.skipMarkers.some((re) => re.test('// FLAKY'))).toBe(true);
  });

  it('replaces a list only when replace is set and the list is not empty', () => {
    const r = resolveRules(
      {
        ...none,
        ecosystems: ['go'],
        gate_rules: {
          config_globs: [],
          test_globs: ['spec/**'],
          skip_patterns: [],
          replace: true,
        },
      },
      [],
    );

    expect(isTestFile('pkg/a_test.go', r)).toBe(false);
    expect(isTestFile('spec/a.txt', r)).toBe(true);
    expect(r.configGlobs).toContain('.golangci.yml');
    expect(r.skipMarkers.some((re) => re.test('t.Skip("x")'))).toBe(true);
  });

  it('keeps the files that blind every gate even when config globs are replaced', () => {
    const r = resolveRules(
      {
        ...none,
        ecosystems: ['go'],
        gate_rules: {
          config_globs: ['only.cfg'],
          test_globs: [],
          skip_patterns: [],
          replace: true,
        },
      },
      [],
    );

    expect(r.configGlobs).toEqual(['.gitattributes', 'makefile', 'justfile', 'only.cfg']);
  });
});

describe('config-guard files per ecosystem', () => {
  it.each([
    ['node', 'packages/a/vitest.config.ts'],
    ['node', '.npmrc'],
    ['python', 'pyproject.toml'],
    ['python', 'tests/conftest.py'],
    ['python', 'tox.ini'],
    ['go', '.golangci.yml'],
    ['rust', 'rustfmt.toml'],
    ['rust', 'crate/.cargo/config.toml'],
    ['rust', 'clippy.toml'],
    ['jvm', 'config/checkstyle.xml'],
    ['dotnet', 'Directory.Build.props'],
    ['dotnet', '.editorconfig'],
    ['dotnet', 'ci/unit.runsettings'],
    ['ruby', '.rubocop.yml'],
    ['ruby', '.rspec'],
    ['php', 'phpunit.xml'],
    ['php', 'phpcs.xml.dist'],
    ['cmake', 'CMakePresets.json'],
    ['cmake', '.clang-tidy'],
  ])('guards %s config %s', (ecosystem, path) => {
    expect(configFindings(path, [ecosystem])).toBe(1);
  });

  it('guards the files that steer every stack, in any ecosystem', () => {
    for (const path of ['.gitattributes', 'Makefile', 'justfile']) {
      expect(configFindings(path, ['go'])).toBe(1);
    }
  });

  it('does not guard dependency manifests or source of another ecosystem', () => {
    expect(configFindings('go.mod', ['go'])).toBe(0);
    expect(configFindings('Cargo.toml', ['rust'])).toBe(0);
    expect(configFindings('pom.xml', ['jvm'])).toBe(0);
    expect(configFindings('pyproject.toml', ['go'])).toBe(0);
    expect(configFindings('main.go', ['go'])).toBe(0);
  });

  it('guards every ecosystem when none is named or detectable', () => {
    expect(configFindings('pytest.ini')).toBe(1);
    expect(configFindings('.rubocop.yml')).toBe(1);
  });
});
