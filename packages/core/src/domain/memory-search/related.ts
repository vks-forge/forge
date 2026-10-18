/**
 * Related-record weights — how rare a shared tag is and which words make a record distinctive.
 *
 * Why: "related" must name the records worth reading next. A tag that most decisions carry says nothing
 *   about two of them being close, while a tag three records share says a lot, so tags are weighed by how
 *   rare they are and the ones on more than a quarter of the active records are ignored. A record's own
 *   most distinctive words (frequent in it, rare in the project) find similar text without any model.
 *
 * Exports: tagWeights(), termFrequencies(), distinctiveTerms(), COMMON_TAG_SHARE, DISTINCTIVE_TERM_COUNT.
 * Depends on: domain/memory-search/query-terms. Pure, no IO.
 */

import { STOP_WORDS, wordsOf } from '#/domain/memory-search/query-terms.js';

/** A tag on more than this share of the active records is too common to say anything. */
export const COMMON_TAG_SHARE = 0.25;
export const DISTINCTIVE_TERM_COUNT = 8;

/** `log(n / df)` per tag; tags held by more than 25% of the `n` active records get no entry. */
export function tagWeights(
  df: Readonly<Record<string, number>>,
  n: number,
): Map<string, number> {
  const out = new Map<string, number>();
  if (n <= 0) {
    return out;
  }

  for (const [tag, count] of Object.entries(df)) {
    if (count > 0 && count / n <= COMMON_TAG_SHARE) {
      out.set(tag, Math.log(n / count));
    }
  }

  return out;
}

/** How often each searchable word occurs in the text; filler words are left out. */
export function termFrequencies(text: string): Map<string, number> {
  const tf = new Map<string, number>();
  for (const word of wordsOf(text)) {
    if (!STOP_WORDS.has(word)) {
      tf.set(word, (tf.get(word) ?? 0) + 1);
    }
  }

  return tf;
}

/**
 * The best `k` words by frequency in the record times rarity in the project (`df` counts records holding the
 * word). The rarity is smoothed so a very small project still ranks its words instead of scoring them zero.
 */
export function distinctiveTerms(
  tf: ReadonlyMap<string, number>,
  df: Readonly<Record<string, number>>,
  n: number,
  k = DISTINCTIVE_TERM_COUNT,
): string[] {
  return [...tf]
    .map(([term, count]) => ({
      term,
      score: count * Math.log(1 + (n + 1) / ((df[term] ?? 0) + 1)),
    }))
    .sort((a, b) => b.score - a.score || (a.term < b.term ? -1 : 1))
    .slice(0, k)
    .map((t) => t.term);
}
