/**
 * Query terms — turns free text or key words into a safe full-text match expression.
 *
 * Why: memory search runs on SQLite FTS5, whose query syntax has operators (`AND`, `OR`, `NEAR(`, `*`,
 *   `col:value`, a leading `-`). Text typed by an owner or Worker, written by a model, or lifted from a
 *   ticket body must never reach that syntax raw: a stray quote makes the query throw and would block a
 *   Director step, and `col:value` could point the match at a column the scope never meant. Every term is
 *   cut to letters, digits, `_` and `-` and double-quoted, so the only operators in the output are the
 *   ones written here. Words with no search value (the, and, how) are dropped, and a question that is
 *   only such words gives `null`, never a match on everything (d-0168).
 *
 * Exports: STOP_WORDS, MAX_MATCH_TERMS, wordsOf(), extractTerms(), buildMatch().
 * Depends on: types/memory-search. Pure, no IO.
 */

import type { MatchInput } from '#/types/memory-search.types.js';

export const MAX_MATCH_TERMS = 12;

const WORD = /[\p{L}\p{N}_-]+/gu;

/** Common English filler that says nothing about which record is wanted. */
export const STOP_WORDS: ReadonlySet<string> = new Set(
  (
    'a an and are as at be been but by can could did do does for from had has have how i if in into is it ' +
    'its me my no not of on or our should so than that the their them then there these they this to up us ' +
    'was we were what when where which who why will with would you your about also any all just more most ' +
    'some such very'
  ).split(' '),
);

/** The words of a string: letters, digits, `_` and `-`, lower-cased, with stray hyphens trimmed. */
export function wordsOf(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.toLowerCase().match(WORD) ?? []) {
    const word = raw.replace(/^[-_]+|[-_]+$/g, '');
    if (word !== '') {
      out.push(word);
    }
  }

  return out;
}

/** The searchable words of a question, in order, without filler and without repeats, at most 12. */
export function extractTerms(text: string): string[] {
  const seen = new Set<string>();
  for (const word of wordsOf(text)) {
    if (!STOP_WORDS.has(word)) {
      seen.add(word);
    }

    if (seen.size === MAX_MATCH_TERMS) {
      break;
    }
  }

  return [...seen];
}

/** One term as a quoted phrase body, or null when nothing searchable is left. */
function clean(term: string): { text: string } | null {
  const words = wordsOf(term);
  if (words.length === 0 || (words.length === 1 && STOP_WORDS.has(words[0] as string))) {
    return null;
  }

  return { text: words.join(' ').replace(/"/g, '""') };
}

const present = (c: { text: string } | null): c is { text: string } => c !== null;

/**
 * A match expression: `"a" AND "b"` or `"a" OR "b" OR "syn"`, each term double-quoted (a quote inside is
 * doubled), at most 12 terms. `null` when there is nothing to search for.
 */
export function buildMatch(input: MatchInput): string | null {
  const main = input.terms.map(clean).filter(present);
  const extra =
    input.mode === 'or' ? (input.synonyms ?? []).map(clean).filter(present) : [];

  const kept = [...main, ...extra].slice(0, MAX_MATCH_TERMS);
  if (kept.length === 0) {
    return null;
  }

  const starAt =
    input.prefix === true && main.length > 0
      ? Math.min(main.length, kept.length) - 1
      : -1;

  const parts = kept.map(
    (c, i) => `"${c.text}"${i === starAt && c.text.length >= 3 ? '*' : ''}`,
  );

  return parts.join(input.mode === 'and' ? ' AND ' : ' OR ');
}
