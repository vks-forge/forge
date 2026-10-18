/**
 * Rank fusion — merges several ranked id lists into one.
 *
 * Why: a memory search asks several questions at once (every term, any term, tags, one hop of links) and
 *   each answers with its own ranking and its own scale. Reciprocal rank fusion needs only the positions,
 *   so a record that sits high in more than one list rises without anyone tuning weights, and it can only
 *   ever return an id some list returned, so scope filtering done by the lists cannot be undone here
 *   (d-0168).
 *
 * Exports: rrf().
 * Depends on: types/memory-search. Pure, no IO.
 */

import type { FusedId } from '#/types/memory-search.types.js';

/** Each list is best first; the score of an id is the sum of `1 / (c + position)` over the lists it is in. */
export function rrf(lists: readonly (readonly string[])[], c = 60): FusedId[] {
  const scores = new Map<string, number>();
  for (const list of lists) {
    const seen = new Set<string>();
    list.forEach((id, i) => {
      if (!seen.has(id)) {
        seen.add(id);
        scores.set(id, (scores.get(id) ?? 0) + 1 / (c + i + 1));
      }
    });
  }

  // Map keeps first-seen order and Array.sort is stable, so equal scores keep it.
  return [...scores]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score);
}
