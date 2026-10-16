/**
 * Tests for the dependency cycle check.
 *
 * Why: two cards that wait on each other can never start, and the owner would see both stuck
 *   in Queued with no way out. `findCycle()` is the one refusal for card edges now and ticket
 *   edges later, so it must catch direct, transitive and self loops, name the loop for the
 *   error message, and never reject an acyclic graph.
 *
 * Pins: self edge, two-card loop, transitive loop with the path named, a diamond that is not
 *   a cycle, old cycles not reported, and properties against a reference topological check.
 * Depends on: src/domain/graph-cycle, fast-check, vitest.
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { findCycle } from '#/domain/graph-cycle.js';

const e = (from: string, to: string) => ({ from, to });

describe('findCycle', () => {
  it('accepts edges into an empty graph and a diamond', () => {
    expect(findCycle([], [e('A', 'B')])).toBeNull();
    expect(findCycle([e('A', 'B'), e('A', 'C'), e('B', 'D')], [e('C', 'D')])).toBeNull();
  });

  it('refuses an edge from a card to itself', () => {
    expect(findCycle([], [e('A', 'A')])).toEqual(['A', 'A']);
  });

  it('names a two-card loop as a closed path', () => {
    expect(findCycle([e('B', 'A')], [e('A', 'B')])).toEqual(['A', 'B', 'A']);
  });

  it('names a transitive loop in dependency order', () => {
    const existing = [e('B', 'C'), e('C', 'D')];

    expect(findCycle(existing, [e('D', 'B')])).toEqual(['D', 'B', 'C', 'D']);
  });

  it('catches a loop made by two added edges together', () => {
    expect(findCycle([], [e('A', 'B'), e('B', 'A')])).toEqual(['A', 'B', 'A']);
  });

  it('does not report a cycle the existing edges already hold', () => {
    expect(findCycle([e('A', 'B'), e('B', 'A')], [e('C', 'D')])).toBeNull();
  });

  it('works for any string id type', () => {
    expect(findCycle([e('DCP-C3', 'DCP-C4')], [e('DCP-C4', 'DCP-C3')])).toEqual([
      'DCP-C4',
      'DCP-C3',
      'DCP-C4',
    ]);
  });
});

describe('findCycle: properties', () => {
  const node = fc.constantFrom('A', 'B', 'C', 'D', 'E');
  const edge = fc.record({ from: node, to: node });

  // Reference: peel off nodes with no outgoing edge to a remaining node; a cycle is what is left.
  const acyclic = (edges: { from: string; to: string }[]): boolean => {
    const left = new Set(edges.flatMap((x) => [x.from, x.to]));
    let progress = true;
    while (progress) {
      progress = false;
      for (const n of [...left]) {
        if (!edges.some((x) => x.from === n && left.has(x.to))) {
          left.delete(n);
          progress = true;
        }
      }
    }

    return left.size === 0;
  };

  it('agrees with a topological check when the existing graph is acyclic', () => {
    fc.assert(
      fc.property(
        fc.array(edge, { maxLength: 8 }),
        fc.array(edge, { maxLength: 3 }),
        (a, b) => {
          fc.pre(acyclic(a));

          expect(findCycle(a, b) === null).toBe(acyclic([...a, ...b]));
        },
      ),
    );
  });

  it('returns a closed path whose steps are all edges of the graph', () => {
    fc.assert(
      fc.property(
        fc.array(edge, { maxLength: 8 }),
        fc.array(edge, { minLength: 1, maxLength: 3 }),
        (a, b) => {
          const cycle = findCycle(a, b);
          fc.pre(cycle !== null);
          const path = cycle as string[];
          const all = [...a, ...b];

          expect(path[0]).toBe(path[path.length - 1]);
          for (let i = 0; i + 1 < path.length; i++) {
            expect(all.some((x) => x.from === path[i] && x.to === path[i + 1])).toBe(
              true,
            );
          }
        },
      ),
    );
  });
});
