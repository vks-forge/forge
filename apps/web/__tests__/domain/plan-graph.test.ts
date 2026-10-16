/**
 * Pins: tickets are layered by dependency depth (what depends on nothing first), every edge runs
 * from a dependency to its dependent, an unknown dependency and a loop are ignored, and an empty
 * plan has no size.
 *
 * Why: the plan graph is how the owner sees what can run in parallel. A ticket drawn left of
 *   something it depends on, or a loop that hangs the layout, would make the picture lie or
 *   freeze the Plan tab.
 * Depends on: src/domain/plan-graph. No IO.
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_METRICS, layoutPlanGraph } from '#/domain/plan-graph.js';

const t = (key: string, depends_on: string[] = []) => ({ key, depends_on });

describe('layoutPlanGraph', () => {
  it('puts a ticket one layer to the right of its deepest dependency', () => {
    const { nodes } = layoutPlanGraph([t('t1'), t('t2', ['t1']), t('t3', ['t1', 't2'])]);

    expect(nodes.map((n) => [n.key, n.depth])).toEqual([
      ['t1', 0],
      ['t2', 1],
      ['t3', 2],
    ]);
  });

  it('stacks tickets of the same depth in rows and sizes the drawing to fit', () => {
    const layout = layoutPlanGraph([t('a'), t('b'), t('c', ['a'])]);
    const { nodeHeight, nodeWidth, gapX, gapY } = DEFAULT_METRICS;

    expect(layout.nodes.find((n) => n.key === 'b')?.y).toBe(nodeHeight + gapY);
    expect(layout.width).toBe(2 * nodeWidth + gapX);
    expect(layout.height).toBe(2 * nodeHeight + gapY);
  });

  it('draws one edge per dependency, from the dependency to the dependent', () => {
    const { edges } = layoutPlanGraph([t('t1'), t('t2', ['t1'])]);

    expect(edges).toEqual([{ from: 't1', to: 't2' }]);
  });

  it('ignores a dependency that is not in the plan and survives a loop', () => {
    const missing = layoutPlanGraph([t('t1', ['ghost'])]);
    const loop = layoutPlanGraph([t('a', ['b']), t('b', ['a'])]);

    expect(missing.edges).toEqual([]);
    expect(missing.nodes[0]?.depth).toBe(0);
    expect(loop.nodes).toHaveLength(2);
  });

  it('has no size for an empty plan', () => {
    expect(layoutPlanGraph([])).toEqual({ nodes: [], edges: [], width: 0, height: 0 });
  });
});
