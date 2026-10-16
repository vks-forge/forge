/**
 * Dependency cycle check — would adding these edges make work wait on itself.
 *
 * Why: a card that depends on a card that depends on it can never start, and the owner
 *   would see two cards stuck "Queued" with no way out. The create-card form, the relations
 *   edit and (later) the ticket relations all need the same refusal, with the loop named so
 *   the error can say "DCP-C3 already depends on this card". One pure function over a
 *   generic id type answers it for both cards and tickets (d-0141 item 2, d-0110).
 *
 * Exports: findCycle().
 * Depends on: types/graph-cycle. No IO.
 */

import type { GraphEdge } from '#/types/graph-cycle.types.js';

/** A path from `start` to `goal` along `from -> to` edges, as the visited ids, or null. */
function pathTo<T extends string>(
  next: ReadonlyMap<T, readonly T[]>,
  start: T,
  goal: T,
): T[] | null {
  const seen = new Set<T>([start]);
  const stack: { node: T; path: T[] }[] = [{ node: start, path: [start] }];
  while (stack.length > 0) {
    const { node, path } = stack.pop() as { node: T; path: T[] };
    if (node === goal) {
      return path;
    }

    for (const to of next.get(node) ?? []) {
      if (!seen.has(to)) {
        seen.add(to);
        stack.push({ node: to, path: [...path, to] });
      }
    }
  }

  return null;
}

/**
 * The first cycle that `added` would close over `existing`, as a closed path
 * (`[a, b, c, a]`: a depends on b, b on c, c on a), or null when the graph stays acyclic.
 * A cycle that `existing` already holds, and does not run through an added edge, is not
 * reported: this guards new edges, it does not audit old data.
 */
export function findCycle<T extends string>(
  existing: readonly GraphEdge<T>[],
  added: readonly GraphEdge<T>[],
): T[] | null {
  const next = new Map<T, T[]>();
  for (const edge of [...existing, ...added]) {
    next.set(edge.from, [...(next.get(edge.from) ?? []), edge.to]);
  }

  for (const edge of added) {
    if (edge.from === edge.to) {
      return [edge.from, edge.from];
    }

    // The new edge a -> b closes a loop exactly when b already reaches a.
    const back = pathTo(next, edge.to, edge.from);
    if (back) {
      return [edge.from, ...back];
    }
  }

  return null;
}
