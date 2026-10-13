/**
 * Patch parser and test-file tests — pin how git output becomes per-file line sets.
 *
 * Why: the test-diff gate and the added_test claim read added and removed lines from a
 *   raw patch. A parser that attributed lines to the wrong file, or counted `---`/`+++`
 *   headers as content, would make the gates miss weakening or invent it.
 *
 * Pins: multi-file split, deleted flag, headers not counted, test-file globs, path folding.
 * Depends on: domain/patch, domain/test-files, shared/paths.
 */

import { describe, expect, it } from 'vitest';
import { parsePatch } from '#/domain/patch.js';
import { isTestFile } from '#/domain/test-files.js';
import { foldPath, samePath } from '#/shared/paths.js';
import { patchFor } from '#tests/helpers/fixtures.js';

describe('parsePatch', () => {
  it('splits files and keeps only hunk lines, without markers', () => {
    const files = parsePatch(
      patchFor('a.ts', ['new'], ['old']) + patchFor('b.ts', ['x']),
    );

    expect(files).toEqual([
      { path: 'a.ts', deleted: false, binary: false, added: ['new'], removed: ['old'] },
      { path: 'b.ts', deleted: false, binary: false, added: ['x'], removed: [] },
    ]);
  });

  it('flags deleted files and tolerates CRLF', () => {
    const files = parsePatch(
      patchFor('a.ts', [], ['gone'], true).replaceAll('\n', '\r\n'),
    );

    expect(files[0]?.deleted).toBe(true);
    expect(files[0]?.removed).toEqual(['gone']);
  });

  it('marks a file whose hunks git replaced with "Binary files differ"', () => {
    const patch = [
      'diff --git a/a.test.ts b/a.test.ts',
      'new file mode 100644',
      'index 0000000..5b99f3f',
      'Binary files /dev/null and b/a.test.ts differ',
      '',
    ].join('\n');

    expect(parsePatch(patch)).toEqual([
      { path: 'a.test.ts', deleted: false, binary: true, added: [], removed: [] },
    ]);
  });

  it('fails closed on a diff header it cannot parse', () => {
    const patch =
      'diff --git "a/q\\"x.test.ts" "b/q\\"x.test.ts"\n+++ b/x\n@@ -1 +1 @@\n+it.skip(1)\n';

    const files = parsePatch(patch);

    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({ unparsed: true });
  });

  it('parses non-ASCII paths as they appear with core.quotePath=false', () => {
    const files = parsePatch(patchFor('é/ü.test.ts', ['x']));

    expect(files[0]?.path).toBe('é/ü.test.ts');
  });
});

describe('isTestFile', () => {
  it.each([
    'src/__tests__/a.ts',
    'a.test.ts',
    'x/b.spec.tsx',
    'test/c.js',
    'pkg/tests/d.py',
  ])('recognises %s', (p) => {
    expect(isTestFile(p)).toBe(true);
  });

  it.each(['src/a.ts', 'src/latest.ts', 'contest/a.ts'])('rejects %s', (p) => {
    expect(isTestFile(p)).toBe(false);
  });
});

describe('paths', () => {
  it('folds slashes, case, ./ and the worktree prefix', () => {
    expect(foldPath('./Src\\A.ts')).toBe('src/a.ts');
    expect(samePath('C:\\wt\\Src\\a.ts', 'src/A.ts', 'c:/wt/')).toBe(true);
  });
});
