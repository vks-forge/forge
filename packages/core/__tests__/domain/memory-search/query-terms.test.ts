/**
 * Pins how a question or a list of key words becomes a safe full-text match expression.
 *
 * Why: the memory search runs on SQLite FTS5, whose query language has operators (`AND`, `OR`, `NEAR(`,
 *   `*`, `col:value`, `-`). Words typed by a Worker, an owner or a model, or lifted from a ticket body,
 *   must never be able to use them: a stray quote would throw and block a Director step, and a column
 *   filter could skip the scope. Every term is therefore double-quoted, so the only operators in the
 *   output are the ones this module writes. A question that is nothing but filler words must give no
 *   match rather than match everything.
 *
 * Pins: stop words and case in `extractTerms`, the 12 term cap, the exact AND / OR output with a prefix
 *   star on the last term, doubled quotes, `null` for nothing searchable, and (property) that no input
 *   gives an expression outside the quoted-term grammar or throws.
 * Depends on: src/domain/memory-search/query-terms, fast-check, vitest.
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildMatch, extractTerms } from '#/domain/memory-search/query-terms.js';

/** The only shape an expression may have: quoted terms, `*` right after a closing quote, `AND` / `OR`. */
const GRAMMAR = /^"(?:[^"]|"")+"\*?(?: (?:AND|OR) "(?:[^"]|"")+"\*?)*$/;

describe('extractTerms', () => {
  it('lower-cases, drops filler words and keeps hyphenated words whole', () => {
    expect(extractTerms('How do we handle TDD red-green in the Director?')).toEqual([
      'handle',
      'tdd',
      'red-green',
      'director',
    ]);
  });

  it('keeps each word once, in order, and stops at 12', () => {
    expect(extractTerms('alpha beta alpha gamma')).toEqual(['alpha', 'beta', 'gamma']);
    const many = Array.from({ length: 40 }, (_, i) => `word${i}`).join(' ');

    expect(extractTerms(many)).toHaveLength(12);
  });

  it('returns nothing for filler words, symbols, emoji and the empty string', () => {
    expect(extractTerms('the and of to is')).toEqual([]);
    expect(extractTerms('*** -- :: 🚀')).toEqual([]);
    expect(extractTerms('')).toEqual([]);
  });
});

describe('buildMatch', () => {
  it('ANDs the terms and stars the last one when asked', () => {
    expect(buildMatch({ terms: ['tdd', 'red'], mode: 'and', prefix: true })).toBe(
      '"tdd" AND "red"*',
    );

    expect(buildMatch({ terms: ['tdd', 'red'], mode: 'and' })).toBe('"tdd" AND "red"');
  });

  it('ORs terms and synonyms, starring the last term only', () => {
    expect(
      buildMatch({
        terms: ['tdd', 'red'],
        synonyms: ['testing', 'unit-test'],
        mode: 'or',
        prefix: true,
      }),
    ).toBe('"tdd" OR "red"* OR "testing" OR "unit-test"');
  });

  it('ignores synonyms in AND mode and does not star a term shorter than three', () => {
    expect(
      buildMatch({ terms: ['ci'], synonyms: ['pipeline'], mode: 'and', prefix: true }),
    ).toBe('"ci"');
  });

  it('turns a multi-word term into one quoted phrase', () => {
    expect(buildMatch({ terms: ['red green'], mode: 'and' })).toBe('"red green"');
  });

  it('returns null when nothing is searchable', () => {
    expect(buildMatch({ terms: [], mode: 'and' })).toBeNull();
    expect(buildMatch({ terms: ['the', 'and'], mode: 'or' })).toBeNull();
    expect(buildMatch({ terms: ['🚀', '***'], mode: 'or' })).toBeNull();
  });

  it('keeps hostile text inside quotes', () => {
    const hostile = [
      'a" OR "b',
      'NEAR(',
      '*',
      '-',
      'col:val',
      "'; DROP TABLE x;--",
      'x'.repeat(10_000),
      '"',
      '""""',
    ];

    for (const text of hostile) {
      const match = buildMatch({ terms: extractTerms(text), mode: 'or', prefix: true });
      const raw = buildMatch({ terms: [text], mode: 'and', prefix: true });

      for (const m of [match, raw]) {
        expect(m === null || GRAMMAR.test(m)).toBe(true);
      }
    }
  });

  it('never throws and never leaves the quoted grammar, for any terms (property)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ maxLength: 60 }), { maxLength: 20 }),
        fc.array(fc.string({ maxLength: 60 }), { maxLength: 20 }),
        fc.constantFrom<'and' | 'or'>('and', 'or'),
        fc.boolean(),
        (terms, synonyms, mode, prefix) => {
          const m = buildMatch({ terms, synonyms, mode, prefix });

          return m === null || GRAMMAR.test(m);
        },
      ),
    );
  });

  it('never throws on arbitrary unicode text through extractTerms (property)', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary', maxLength: 300 }), (text) => {
        const m = buildMatch({ terms: extractTerms(text), mode: 'or', prefix: true });

        return m === null || GRAMMAR.test(m);
      }),
    );
  });
});
