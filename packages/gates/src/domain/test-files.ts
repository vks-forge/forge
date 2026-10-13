/**
 * Test-file recognition.
 *
 * Why: the claim matcher and the test-diff gate must agree on which paths are tests,
 *   otherwise a Worker could claim a test "added" in a file the diff gate does not
 *   guard. One glob-like rule, applied to folded paths, serves both.
 *
 * Exports: isTestFile().
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
