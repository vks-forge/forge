/**
 * Per-ecosystem test-file, skip-marker and declaration tests.
 *
 * Why: the test-diff gate and the `added_test` claim both depend on knowing what a test
 *   file, a silenced test and a test declaration look like in each language. One wrong
 *   pattern is a language where deleting, skipping or inventing a test goes unnoticed.
 *   These cases pin the data per ecosystem, with honest edits that must keep passing.
 *
 * Pins: test-file patterns, Rust in-file test modules, skip markers, dropped assertions
 *   and test declarations per ecosystem.
 * Depends on: domain/gate-rules, domain/test-diff, domain/test-files, domain/patch,
 *   helpers/fixtures. No IO.
 */

import { describe, expect, it } from 'vitest';
import { resolveRules } from '#/domain/gate-rules.js';
import { parsePatch } from '#/domain/patch.js';
import { checkTestDiff } from '#/domain/test-diff.js';
import { declaresTest, isTestFile, isTestPatch } from '#/domain/test-files.js';
import { diffOf, patchFor } from '#tests/helpers/fixtures.js';

const none = { ecosystems: [], checks: [], gate_rules: undefined };

const rulesFor = (...paths: string[]) => resolveRules(none, paths);

function weakened(path: string, added: string[], removed: string[] = []) {
  const patch = patchFor(path, added, removed);

  return checkTestDiff(
    diffOf([{ status: 'M', path }], patch),
    parsePatch(patch),
    rulesFor(path),
  );
}

describe('test-file patterns per ecosystem', () => {
  it.each([
    'src/__tests__/a.ts',
    'a.test.tsx',
    'a.spec.js',
    'tests/test_a.py',
    'pkg/test_calc.py',
    'pkg/calc_test.py',
    'pkg/calc_test.go',
    'tests/integration.rs',
    'app/src/test/java/FooTest.java',
    'FooTests.kt',
    'Api.Tests/FooTests.cs',
    'spec/models/user_spec.rb',
    'test/user_test.rb',
    'tests/FooTest.php',
    'LoginTest.php',
    'test/foo_test.cpp',
  ])('treats %s as a test file', (path) => {
    expect(isTestFile(path)).toBe(true);
  });

  it.each([
    'src/a.ts',
    'calc.py',
    'calc.go',
    'src/lib.rs',
    'App.java',
    'docs/testing.md',
  ])('does not treat %s as a test file', (path) => {
    expect(isTestFile(path)).toBe(false);
  });

  it('narrows to the active ecosystem', () => {
    const go = resolveRules({ ...none, ecosystems: ['go'] }, []);

    expect(isTestFile('calc_test.go', go)).toBe(true);
    expect(isTestFile('test_calc.py', go)).toBe(false);
  });

  it('sees a Rust test module inside a source file by its changed lines', () => {
    const rust = resolveRules({ ...none, ecosystems: ['rust'] }, []);
    const file = (added: string[]) => ({
      path: 'src/lib.rs',
      deleted: false,
      binary: false,
      added,
      removed: [],
    });

    expect(isTestPatch(file(['#[cfg(test)]', 'mod tests {']), rust)).toBe(true);
    expect(isTestPatch(file(['pub fn add() {}']), rust)).toBe(false);
  });
});

describe('test-weakening markers per ecosystem', () => {
  it.each([
    ['src/__tests__/a.test.ts', "it.skip('adds', () => {})"],
    ['src/__tests__/a.test.ts', "xit('adds', () => {})"],
    ['tests/test_calc.py', '@pytest.mark.skip(reason="later")'],
    ['tests/test_calc.py', '@pytest.mark.xfail'],
    ['tests/test_calc.py', '    pytest.skip("no")'],
    ['tests/test_calc.py', '@unittest.skip("no")'],
    ['calc_test.go', '\tt.Skip("flaky")'],
    ['tests/api.rs', '#[ignore]'],
    ['src/test/java/FooTest.java', '@Disabled("later")'],
    ['src/test/java/FooTest.java', '@Ignore'],
    ['FooTests.cs', '[Ignore]'],
    ['FooTests.cs', '[Fact(Skip = "later")]'],
    ['spec/a_spec.rb', "  xit 'works' do"],
    ['spec/a_spec.rb', '  pending'],
    ['tests/FooTest.php', '$this->markTestSkipped("no");'],
    ['test/foo_test.cpp', 'TEST(Calc, DISABLED_adds) {'],
  ])('flags %s adding %s', (path, line) => {
    const out = weakened(path, [line]);

    expect(out.status).toBe('failed');
    expect(out.findings[0]?.message).toContain('disabled or focused');
  });

  it.each([
    ['tests/test_calc.py', 'def test_adds():'],
    ['calc_test.go', 'func TestAdd(t *testing.T) {'],
    ['tests/api.rs', 'fn adds() {}'],
    ['spec/a_spec.rb', "  it 'adds' do"],
    ['src/test/java/FooTest.java', '@Test'],
  ])('lets %s add the honest line %s', (path, line) => {
    expect(weakened(path, [line]).status).toBe('passed');
  });

  it('flags a deleted Go test file and an assertion dropped from a Python test', () => {
    const deleted = checkTestDiff(
      diffOf([{ status: 'D', path: 'calc_test.go' }], ''),
      [],
      rulesFor('calc_test.go'),
    );

    const dropped = weakened('tests/test_calc.py', [], ['    assert add(1, 2) == 3']);

    expect(deleted.findings[0]?.message).toContain('test file deleted');
    expect(dropped.findings[0]?.message).toContain('assertion line(s) removed');
  });

  it('counts a dropped Go assertion and a dropped Rust assert', () => {
    expect(weakened('calc_test.go', [], ['\tt.Errorf("bad")']).status).toBe('failed');
    expect(
      checkTestDiff(
        diffOf([{ status: 'M', path: 'tests/a.rs' }], ''),
        parsePatch(patchFor('tests/a.rs', [], ['    assert_eq!(add(1, 2), 3);'])),
        rulesFor('tests/a.rs'),
      ).status,
    ).toBe('failed');
  });
});

describe('test declarations per ecosystem', () => {
  it.each([
    ["it('adds numbers', () => {})", 'adds numbers'],
    ['def test_adds_numbers():', 'adds_numbers'],
    ['    async def test_adds_numbers():', 'test_adds'],
    ['func TestAddsNumbers(t *testing.T) {', 'AddsNumbers'],
    ['fn adds_numbers() {', 'adds_numbers'],
    ['    void addsNumbers() {', 'addsNumbers'],
    ['@DisplayName("adds numbers")', 'adds numbers'],
    ['    public void AddsNumbers()', 'AddsNumbers'],
    ["  it 'adds numbers' do", 'adds numbers'],
    ['    public function testAddsNumbers()', 'AddsNumbers'],
    ['TEST(Calc, AddsNumbers) {', 'AddsNumbers'],
  ])('recognises %s as declaring %s', (line, name) => {
    expect(declaresTest(line, name)).toBe(true);
  });

  it.each([
    ["// it('adds numbers', () => {})", 'adds numbers'],
    ['# def test_adds_numbers():', 'adds_numbers'],
    ['    x = add_numbers()', 'add_numbers'],
    ['assert add_numbers() == 3', 'add_numbers'],
    ['func TestAdds(t *testing.T) {', 'Subtracts'],
  ])('rejects %s as a declaration of %s', (line, name) => {
    expect(declaresTest(line, name)).toBe(false);
  });
});
