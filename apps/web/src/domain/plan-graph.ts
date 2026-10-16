/**
 * Plan graph: lays a plan's tickets out in layers by dependency depth.
 *
 * Why: a plan's order is only half the story; the owner also needs to see which tickets wait
 *   for which, because that decides what runs in parallel and where one delay stalls the rest.
 *   A small layered picture (dependencies on the left, dependents on the right) shows that at a
 *   glance without a chart library. The layout is pure arithmetic on keys, so it is testable
 *   and a dependency on a key that is not in the plan (or a loop the server should have
 *   refused) is ignored instead of hanging the page.
 *
 * Exports: layoutPlanGraph(), DEFAULT_METRICS.
 * Depends on: types/plan.types. No IO.
 */

import type { GraphInput, GraphLayout, GraphMetrics } from '#/types/plan.types.js';

export const DEFAULT_METRICS: GraphMetrics = {
  nodeWidth: 72,
  nodeHeight: 32,
  gapX: 44,
  gapY: 14,
};

/** Depth of each key: 0 without dependencies, else 1 + the deepest dependency. Loops count once. */
function depths(tickets: readonly GraphInput[]): ReadonlyMap<string, number> {
  const byKey = new Map(tickets.map((t) => [t.key, t]));
  const memo = new Map<string, number>();

  const depthOf = (key: string, path: ReadonlySet<string>): number => {
    const known = memo.get(key);
    if (known !== undefined) {
      return known;
    }

    const deps = (byKey.get(key)?.depends_on ?? []).filter(
      (dep) => byKey.has(dep) && !path.has(dep),
    );

    const next = new Set(path).add(key);
    const depth =
      deps.length === 0 ? 0 : 1 + Math.max(...deps.map((d) => depthOf(d, next)));

    memo.set(key, depth);

    return depth;
  };

  return new Map(tickets.map((t) => [t.key, depthOf(t.key, new Set())]));
}

/** Positions for every ticket and the edges between them, plus the size of the drawing. */
export function layoutPlanGraph(
  tickets: readonly GraphInput[],
  metrics: GraphMetrics = DEFAULT_METRICS,
): GraphLayout {
  const depth = depths(tickets);
  const rows = new Map<number, number>();
  const known = new Set(tickets.map((t) => t.key));

  const nodes = tickets.map((ticket) => {
    const d = depth.get(ticket.key) ?? 0;
    const row = rows.get(d) ?? 0;
    rows.set(d, row + 1);

    return {
      key: ticket.key,
      depth: d,
      x: d * (metrics.nodeWidth + metrics.gapX),
      y: row * (metrics.nodeHeight + metrics.gapY),
    };
  });

  const edges = tickets.flatMap((ticket) =>
    ticket.depends_on
      .filter((dep) => known.has(dep))
      .map((dep) => ({ from: dep, to: ticket.key })),
  );

  const layers = Math.max(0, ...nodes.map((n) => n.depth)) + 1;
  const tallest = Math.max(0, ...rows.values());

  return {
    nodes,
    edges,
    width:
      nodes.length === 0 ? 0 : layers * metrics.nodeWidth + (layers - 1) * metrics.gapX,
    height:
      nodes.length === 0
        ? 0
        : tallest * metrics.nodeHeight + (tallest - 1) * metrics.gapY,
  };
}
