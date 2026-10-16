/**
 * Card chain: every card connected to one card through "blocked by" and "blocks", in both directions.
 *
 * Why: hovering or focusing a card on the Board should answer "what does this one hold up, and
 *   what holds it up?" at a glance (d-0139), which means following the links all the way, not
 *   just one step. Both lists on a card describe the same edge from two sides (A blocked by B is
 *   B blocks A), and either may be the only one the server filled in, so both are read. Only the
 *   cards upstream and downstream count; a card that merely shares a blocker with it does not.
 *   A loop cannot hang it: each card is visited once.
 *
 * Exports: dependencyChain().
 * Depends on: types/cards-ui.types. No IO.
 */

import type { CardLinks } from '#/types/cards-ui.types.js';

function walk(
  start: string,
  edges: ReadonlyMap<string, ReadonlySet<string>>,
): Set<string> {
  const seen = new Set<string>();
  const queue = [start];

  for (let id = queue.pop(); id !== undefined; id = queue.pop()) {
    for (const next of edges.get(id) ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }

  return seen;
}

function add(map: Map<string, Set<string>>, key: string, value: string): void {
  const set = map.get(key) ?? new Set<string>();
  map.set(key, set.add(value));
}

/** The card, everything it waits on (transitively) and everything that waits on it. */
export function dependencyChain(
  cards: readonly CardLinks[],
  id: string,
): ReadonlySet<string> {
  const blockedBy = new Map<string, Set<string>>();
  const blocks = new Map<string, Set<string>>();

  for (const card of cards) {
    for (const dep of card.depends_on) {
      add(blockedBy, card.id, dep);
      add(blocks, dep, card.id);
    }

    for (const waiting of card.blocks) {
      add(blocks, card.id, waiting);
      add(blockedBy, waiting, card.id);
    }
  }

  return new Set([id, ...walk(id, blockedBy), ...walk(id, blocks)]);
}
