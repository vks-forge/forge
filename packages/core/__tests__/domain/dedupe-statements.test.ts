/**
 * Tests for the statement dedupe used on a plan's risks and assumptions.
 *
 * Why: the owner reads a plan's risk list to decide whether to approve. When the planner rephrased
 *   what survey and verify had already said, the list repeated itself (eleven entries for three
 *   or four real risks in the eval), which hides the one risk that matters. The dedupe must drop
 *   rewordings and never a different risk: dropping a real risk would silently weaken approval.
 *
 * Pins: rewordings and labelled copies collapse onto the first, order is kept, distinct risks
 *   survive, the T1 fixture shrinks from 11 to 4; by property the result is idempotent, a
 *   subsequence of the input, and keeps every statement that shares no words with another.
 * Depends on: src/domain/dedupe-statements, fast-check, vitest.
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { dedupeStatements, normaliseStatement } from '#/domain/dedupe-statements.js';

const T1_RISKS = [
  'Migration may lock the todos table during deploy',
  'Risk: the migration may lock the todos table during the deploy.',
  'Migration may lock the todos table during deploy.',
  'The migration may lock the todos table during deploy',
  'Completed todos have no archive column, so hiding them needs a schema change',
  'Completed todos have no archive column so hiding them needs a schema change.',
  'No tests cover the sync path',
  'No tests cover the sync path!',
  'UNVERIFIED: the library rate limit is 60 requests per minute',
  'UNVERIFIED: the library rate limit is 60 requests per minute.',
  'Risk: UNVERIFIED: the library rate limit is 60 requests per minute',
];

describe('dedupeStatements', () => {
  it('normalises case, punctuation, spacing and a leading label', () => {
    expect(normaliseStatement('  Risk:  Data   LOSS, maybe! ')).toBe('data loss maybe');
    expect(normaliseStatement('Assumption: Single user.')).toBe('single user');
  });

  it('keeps the first of two statements that differ only in wording noise', () => {
    expect(
      dedupeStatements(['Risk: data loss on rollback', 'data loss on rollback.']),
    ).toEqual(['Risk: data loss on rollback']);
  });

  it('keeps statements that say different things', () => {
    const out = dedupeStatements([
      'Migration may lock the table',
      'Public API changes break old clients',
    ]);

    expect(out).toHaveLength(2);
  });

  it('shrinks the T1 risk list from 11 entries to the 4 distinct risks, first wording kept', () => {
    const out = dedupeStatements(T1_RISKS);

    expect(out).toHaveLength(4);
    expect(out[0]).toBe(T1_RISKS[0]);
    expect(out[1]).toBe(T1_RISKS[4]);
  });

  it('drops empty statements and keeps order', () => {
    expect(dedupeStatements(['b thing', '', '...', 'a other'])).toEqual([
      'b thing',
      'a other',
    ]);
  });

  it('is idempotent and returns a subsequence of its input (property)', () => {
    fc.assert(
      fc.property(fc.array(fc.string({ maxLength: 40 }), { maxLength: 12 }), (xs) => {
        const once = dedupeStatements(xs);

        expect(dedupeStatements(once)).toEqual(once);
        let at = 0;
        for (const x of xs) {
          if (x === once[at]) {
            at += 1;
          }
        }

        expect(at).toBe(once.length);
      }),
    );
  });

  it('never drops a statement that shares no word with another (property)', () => {
    const word = fc.stringMatching(/^[a-z]{5,8}$/);
    fc.assert(
      fc.property(fc.uniqueArray(word, { minLength: 1, maxLength: 8 }), (words) => {
        // Each statement is one word of its own, so none overlaps another.
        expect(dedupeStatements(words)).toEqual(words);
      }),
    );
  });
});
