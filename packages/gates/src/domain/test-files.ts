/**
 * Test-file recognition.
 *
 * Why: the claim matcher and the test-diff gate must agree on which paths are tests,
 *   otherwise a Worker could claim a test "added" in a file the diff gate does not
 *   guard. One rule set, applied to folded paths, serves both. What a test file looks
 *   like depends on the language (`*_test.go`, `tests/`, `src/test/`, or a `#[cfg(test)]`
 *   module inside a source file), so the patterns come from the resolved ecosystem rules.
 *
 * Exports: isTestFile(), isTestPatch(), declaresTest().
 * Depends on: @forge/core (globMatch), domain/gate-rules, shared/paths, types. No IO.
 */

import { globMatch } from '@forge/core';
import { ALL_RULES } from '#/domain/gate-rules.js';
import { foldPath } from '#/shared/paths.js';
import type { ResolvedRules } from '#/types/ecosystem.types.js';
import type { PatchFile } from '#/types/check.types.js';

/** True when the path matches a test glob; every ecosystem's globs apply unless `rules` narrow them. */
export function isTestFile(path: string, rules: ResolvedRules = ALL_RULES): boolean {
  const p = foldPath(path);

  return rules.testGlobs.some((g) => globMatch(g, p, true));
}

/**
 * True for a file the rules treat as tests: by path, or because a changed line carries a
 * test marker (Rust keeps tests inside source files).
 */
export function isTestPatch(file: PatchFile, rules: ResolvedRules): boolean {
  return (
    isTestFile(file.path, rules) ||
    [...file.added, ...file.removed].some((line) =>
      rules.testContent.some((re) => re.test(line)),
    )
  );
}

/** Characters that may end a group prefix (`describe › `, `Class::`, `Mod.`, `a/b/`, `file#`). */
const GROUP_END = /[\s:./#>›]/;

function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * True when `name` is the declared `title` behind a group prefix: it ends with the title and
 * the character before is a separator. A bare short title (one word under 12 characters)
 * cannot back a longer name, or `it("works")` would back "parser works".
 */
function endsWithTitle(name: string, title: string): boolean {
  const n = collapse(name);
  const t = collapse(title);
  if (t.split(' ').length < 2 && t.length < 12) {
    return false;
  }

  return (
    n.length > t.length &&
    n.endsWith(t) &&
    GROUP_END.test(n[n.length - t.length - 1] ?? '')
  );
}

/**
 * True when `line` opens a test declaration in one of the active ecosystems (`it(`,
 * `def test_x`, `func TestX`, `fn x`, ...) and its title or name contains `name`, or `name`
 * is the declared title qualified by its group (`shelf add rejects x`, `Class::test_x`).
 * Comments, strings and calls that merely mention the name do not count.
 */
export function declaresTest(
  line: string,
  name: string,
  rules: ResolvedRules = ALL_RULES,
): boolean {
  return rules.declarations.some((re) => {
    const m = re.exec(line);
    const title = m?.at(-1);

    return (
      typeof title === 'string' && (title.includes(name) || endsWithTitle(name, title))
    );
  });
}
