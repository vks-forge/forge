/**
 * Test-declaration matching tests — pin when a claimed test name counts as declared.
 *
 * Why: Workers claim `added_test` with the runner's full name (`shelf add rejects an empty
 *   title`: the group plus the test), while a declaration line carries only its own title.
 *   If the matcher required the title to contain the whole name, every grouped test of every
 *   language would fail G1 on a true claim; if it accepted any suffix, a one-word title could
 *   back a long invented name.
 *
 * Pins: exact and contains matches, the separator-bounded suffix rule for the group styles of
 *   several ecosystems, the length guard, and the boundary rule.
 * Depends on: domain/test-files.
 */

import { describe, expect, it } from 'vitest';
import { declaresTest } from '#/domain/test-files.js';

const IT_LINE = '  it("rejects an empty title", () => {';

describe('declaresTest', () => {
  it('keeps matching a title that contains the name', () => {
    const line = '  it("adds numbers and more", () => {';

    expect(declaresTest(line, 'adds numbers')).toBe(true);
  });

  it('accepts a describe-qualified name for the declared it() title (FR-2 ceb149)', () => {
    expect(declaresTest(IT_LINE, 'shelf add rejects an empty title')).toBe(true);
  });

  it.each([
    ['  def test_rejects_empty_title(self):', 'TestAdd::test_rejects_empty_title'],
    ['def test_rejects_empty_title():', 'tests.add.test_rejects_empty_title'],
    [IT_LINE, 'shelf add > rejects an empty title'],
    [IT_LINE, 'shelf add › rejects an empty title'],
    [IT_LINE, 'shelf/add/rejects an empty title'],
    [IT_LINE, 'shelf#rejects an empty title'],
    [IT_LINE, 'shelf   add  rejects an   empty title'],
  ])('accepts the group-qualified name for %s (%s)', (line, name) => {
    expect(declaresTest(line, name)).toBe(true);
  });

  it('refuses a one-word short title as the tail of a longer name', () => {
    expect(declaresTest('  it("works", () => {', 'parser works')).toBe(false);
  });

  it('accepts a one-word title of at least 12 characters', () => {
    expect(declaresTest('  it("deserializes", () => {', 'parser deserializes')).toBe(
      true,
    );
  });

  it('refuses a title that is not at a separator boundary', () => {
    expect(declaresTest(IT_LINE, 'xrejects an empty title')).toBe(false);
  });

  it('keeps the case of the title', () => {
    const line = '  it("Rejects an empty title", () => {';

    expect(declaresTest(line, 'shelf add rejects an empty title')).toBe(false);
  });

  it('still needs a declaration line, not a comment', () => {
    expect(declaresTest(`//${IT_LINE}`, 'shelf add rejects an empty title')).toBe(false);
  });
});
