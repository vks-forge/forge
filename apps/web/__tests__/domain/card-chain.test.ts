/**
 * Pins: a card's chain is itself plus everything it waits on and everything waiting on it,
 * through any number of steps and from either list; siblings and strangers are not in it, and a
 * loop cannot hang it.
 *
 * Why: the Board dims every card outside the hovered card's chain. A chain that stops after one
 *   step, ignores a link only one side recorded, or lights a card that merely shares a blocker
 *   would make the highlight mislead about what a delay really holds up.
 * Depends on: src/domain/card-chain. No IO.
 */

import { describe, expect, it } from 'vitest';
import { dependencyChain } from '#/domain/card-chain.js';

const card = (id: string, depends_on: string[] = [], blocks: string[] = []) => ({
  id,
  depends_on,
  blocks,
});

describe('dependencyChain', () => {
  it('follows links through every step in both directions', () => {
    const cards = [card('A'), card('B', ['A']), card('C', ['B']), card('Z')];

    expect([...dependencyChain(cards, 'B')].sort()).toEqual(['A', 'B', 'C']);
  });

  it('reads a link recorded on only one side', () => {
    const cards = [card('A', [], ['B']), card('B')];

    expect([...dependencyChain(cards, 'B')].sort()).toEqual(['A', 'B']);
  });

  it('leaves out a sibling that only shares a blocker', () => {
    const cards = [card('A'), card('B', ['A']), card('C', ['A'])];

    expect([...dependencyChain(cards, 'B')].sort()).toEqual(['A', 'B']);
  });

  it('is just the card when it has no links, and survives a loop', () => {
    expect([...dependencyChain([card('A')], 'A')]).toEqual(['A']);
    expect(dependencyChain([card('A', ['B']), card('B', ['A'])], 'A').size).toBe(2);
  });
});
