/**
 * Test-file recognition.
 *
 * Why: the claim matcher and the test-diff gate must agree on which paths are tests,
 *   otherwise a Worker could claim a test "added" in a file the diff gate does not
 *   guard. One glob-like rule, applied to folded paths, serves both.
 *
 * Exports: isTestFile(), declaresTest().
 * Depends on: shared/paths. No IO.
 */

import { foldPath } from '#/shared/paths.js';

const TEST_DIR = /(^|\/)(__tests__|tests?)\//;
const TEST_NAME = /\.(test|spec)\.[^/]+$/;

/** `__tests__/`, `test/`, `tests/` directories, or `*.test.*` / `*.spec.*` names. */
export function isTestFile(path: string): boolean {
  const p = foldPath(path);

  return TEST_DIR.test(p) || TEST_NAME.test(p);
}

const DECLARATION = /^\s*(?:it|test|describe)(?:\.\w+)*(?:\([^)]*\))?\s*\(\s*(['"`])/;

/**
 * True when `line` opens a test declaration (`it(`, `test.only(`, `describe.each(...)(`) at
 * the start of the line and its title contains `name`. Comments, strings and calls that
 * merely mention the name do not count.
 */
export function declaresTest(line: string, name: string): boolean {
  const m = DECLARATION.exec(line);
  if (!m) {
    return false;
  }

  const rest = line.slice(m[0].length);
  const end = rest.indexOf(m[1] as string);

  return (end === -1 ? rest : rest.slice(0, end)).includes(name);
}
