/**
 * A naive term-overlap scorer for the in-memory memory repository.
 *
 * Why: engine and server tests run on the in-memory backend and still need `searchLexical` to answer, so
 *   this reads the same match expression the SQL adapter gets (quoted terms joined by AND or OR, an
 *   optional star) and scores a record by which of its columns hold each word, statement above gist,
 *   aliases, tags and body. It does no stemming and makes no claim about ranking quality: that is pinned on
 *   SQLite only. It exists so a test of the Director's memory use runs without a native database.
 *
 * Exports: parseMatch(), scoreRecord(), snippetOf(), recordWords().
 * Depends on: @forge/core, types/memory-adapter.types. No IO.
 */

import { wordsOf } from '@forge/core';
import type { MemoryRow } from '@forge/core';
import type { NaiveTerm } from '#/types/memory-adapter.types.js';

const WEIGHTS = { statement: 10, gist: 6, tags: 3, aliases: 5, body: 1 } as const;

/** The terms of a core `buildMatch` expression and whether they are ORed. */
export function parseMatch(match: string): { terms: NaiveTerm[]; or: boolean } {
  const terms = [...match.matchAll(/"((?:[^"]|"")*)"(\*)?/g)].map((m) => ({
    words: (m[1] ?? '')
      .replace(/""/g, '"')
      .split(' ')
      .filter((w) => w !== ''),
    prefix: m[2] === '*',
  }));

  return { terms, or: match.includes('" OR "') };
}

/** The lower-case words of each searchable column of a record. */
export function recordWords(
  r: MemoryRow,
  tags: readonly string[],
): Record<keyof typeof WEIGHTS, string[]> {
  return {
    statement: wordsOf(r.statement),
    gist: wordsOf(r.gist ?? ''),
    tags: tags.flatMap((t) => wordsOf(t)),
    aliases: r.aliases.flatMap((a) => wordsOf(a)),
    body: wordsOf(r.body),
  };
}

const termHits = (words: readonly string[], term: NaiveTerm): number => {
  if (term.words.length === 0) {
    return 0;
  }

  const last = term.words.length - 1;
  const ok = term.words.every((w, i) =>
    words.some((x) => (i === last && term.prefix ? x.startsWith(w) : x === w)),
  );

  return ok ? Math.max(1, words.filter((x) => x === term.words[0]).length) : 0;
};

/** The weighted overlap of the record with the match, or null when it does not match. */
export function scoreRecord(
  r: MemoryRow,
  tags: readonly string[],
  match: string,
): number | null {
  const { terms, or } = parseMatch(match);
  if (terms.length === 0) {
    return null;
  }

  const cols = recordWords(r, tags);
  const per = terms.map((t) =>
    (Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[]).reduce(
      (sum, c) => sum + WEIGHTS[c] * termHits(cols[c], t),
      0,
    ),
  );

  const matched = or ? per.some((p) => p > 0) : per.every((p) => p > 0);

  return matched ? per.reduce((a, b) => a + b, 0) : null;
}

/** The statement (else gist, else body) with each matched word wrapped in the control marks. */
export function snippetOf(r: MemoryRow, match: string): string | null {
  const words = [...new Set(parseMatch(match).terms.flatMap((t) => t.words))];
  for (const text of [r.statement, r.gist ?? '', r.body]) {
    const marked = text.replace(/[\p{L}\p{N}_-]+/gu, (w) =>
      words.some((x) => w.toLowerCase().startsWith(x)) ? `\u0001${w}\u0002` : w,
    );

    if (marked !== text) {
      return marked.slice(0, 400);
    }
  }

  return null;
}
