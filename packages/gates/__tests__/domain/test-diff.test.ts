/**
 * Test-diff gate tests — pin the ways a Worker may not weaken the suite.
 *
 * Why: an agent facing a red test can make it green by deleting, skipping or loosening
 *   it. The project test run then passes and proves nothing. These cases are the exact
 *   patterns the gate promises to catch, plus benign edits it must leave alone so honest
 *   test work is not blocked.
 *
 * Pins: deleted file, rename away, .skip/.only/xit/it.todo, net assertion removal,
 *   matcher weakening, and clean additions / non-test edits passing.
 * Depends on: domain/test-diff, domain/patch, helpers/fixtures.
 */

import { describe, expect, it } from 'vitest';
import { parsePatch } from '#/domain/patch.js';
import { checkTestDiff } from '#/domain/test-diff.js';
import { diffOf, patchFor } from '#tests/helpers/fixtures.js';

const T = 'src/__tests__/a.test.ts';

function run(
  patch: string,
  files: Parameters<typeof diffOf>[0] = [{ status: 'M', path: T }],
) {
  return checkTestDiff(diffOf(files, patch), parsePatch(patch));
}

describe('checkTestDiff', () => {
  it('fails a deleted test file', () => {
    const out = run(patchFor(T, [], ['x'], true), [{ status: 'D', path: T }]);

    expect(out.findings.map((f) => f.message)).toEqual([`${T}: test file deleted`]);
  });

  it('fails a test file renamed to a non-test path', () => {
    const out = run('', [{ status: 'R', path: 'src/a.ts', oldPath: T }]);

    expect(out.status).toBe('failed');
  });

  it.each(["it.skip('a', f)", "describe.only('a', f)", "xit('a', f)", "it.todo('a')"])(
    'fails added %s',
    (line) => {
      expect(run(patchFor(T, [line])).status).toBe('failed');
    },
  );

  it('fails when assertion lines are removed without replacement', () => {
    const out = run(patchFor(T, [], ['expect(a).toBe(1);', 'expect(b).toBe(2);']));

    expect(out.findings[0]?.message).toContain('2 more assertion line(s) removed');
  });

  it('passes a rewritten assertion of equal strength', () => {
    const out = run(patchFor(T, ['expect(a).toBe(2);'], ['expect(a).toBe(1);']));

    expect(out.status).toBe('passed');
  });

  it('fails a weakened matcher even when the count is unchanged', () => {
    const out = run(patchFor(T, ['expect(a).toBeDefined();'], ['expect(a).toEqual(1);']));

    expect(out.findings[0]?.message).toContain('weakened from .toequal to .tobedefined');
  });

  it('passes new tests and ignores non-test files', () => {
    const patch =
      patchFor(T, ["it('new', () => { expect(1).toBe(1); });"]) +
      patchFor('src/a.ts', ['it.skip = 1'], ['expect(x)']);

    expect(run(patch).status).toBe('passed');
  });

  it('fails a non-ASCII test file name that adds .only', () => {
    const path = 'src/é.test.ts';
    const out = run(patchFor(path, ["it.only('x', () => {})"]), [{ status: 'A', path }]);

    expect(out.status).toBe('failed');
    expect(out.findings[0]?.message).toContain('é.test.ts');
  });

  it('fails a test file whose hunks are hidden as binary (.gitattributes -diff)', () => {
    const patch = [
      'diff --git a/a.test.ts b/a.test.ts',
      'new file mode 100644',
      'Binary files /dev/null and b/a.test.ts differ',
      '',
    ].join('\n');

    const out = run(patch, [{ status: 'A', path: 'a.test.ts' }]);

    expect(out.status).toBe('failed');
    expect(out.findings[0]?.message).toContain('binary');
  });

  it('passes a non-test file that is binary', () => {
    const patch = [
      'diff --git a/logo.png b/logo.png',
      'Binary files /dev/null and b/logo.png differ',
      '',
    ].join('\n');

    expect(run(patch, [{ status: 'A', path: 'logo.png' }]).status).toBe('passed');
  });

  it('fails closed on a diff header it cannot parse', () => {
    const patch = 'diff --git "a/we\\"ird.test.ts" "b/we\\"ird.test.ts"\n';

    const out = run(patch, []);

    expect(out.status).toBe('failed');
    expect(out.findings[0]?.message).toContain('could not be parsed');
  });
});
