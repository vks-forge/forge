/**
 * PlanGraphView: a small drawing of which planned tickets wait for which.
 *
 * Why: the ticket list gives the order, but whether two tickets can run side by side, or one
 *   late ticket holds up three others, is only obvious in a picture. Tickets sit in columns by
 *   dependency depth (what depends on nothing on the left), joined by curves from a dependency
 *   to the ticket that waits for it. It is plain SVG with no chart library, scrolls sideways
 *   inside its own box on a narrow screen, and carries a text description of every dependency
 *   so the same facts reach a screen reader (the list above it states them too).
 *
 * Exports: PlanGraphView.
 * Depends on: react, domain/plan-graph, schemas/plan (type), types/plan.types.
 */

import { useMemo } from 'react';
import { DEFAULT_METRICS, layoutPlanGraph } from '#/domain/plan-graph.js';
import type { PlanTicket } from '#/schemas/plan.js';
import { ScrollArea } from '#/components/ui/scroll-area.js';

const PAD = 4;

export function PlanGraphView(props: { tickets: readonly PlanTicket[] }) {
  const { tickets } = props;
  const layout = useMemo(() => layoutPlanGraph(tickets), [tickets]);
  const { nodeWidth: w, nodeHeight: h } = DEFAULT_METRICS;
  const at = new Map(layout.nodes.map((n) => [n.key, n]));

  const description = tickets
    .map((t) =>
      t.depends_on.length > 0
        ? `${t.key} depends on ${t.depends_on.join(', ')}`
        : `${t.key} depends on nothing`,
    )
    .join('. ');

  if (layout.nodes.length === 0) {
    return null;
  }

  return (
    <ScrollArea
      orientation="horizontal"
      className="rounded-xl border border-line bg-bg p-3"
    >
      <svg
        role="img"
        aria-label="Ticket dependency graph"
        width={layout.width + PAD * 2}
        height={layout.height + PAD * 2}
        viewBox={`${-PAD} ${-PAD} ${layout.width + PAD * 2} ${layout.height + PAD * 2}`}
        className="max-w-none"
      >
        <desc>{description}</desc>
        {layout.edges.map((edge) => {
          const from = at.get(edge.from);
          const to = at.get(edge.to);
          if (!from || !to) {
            return null;
          }

          const x1 = from.x + w;
          const y1 = from.y + h / 2;
          const x2 = to.x;
          const y2 = to.y + h / 2;
          const mid = (x1 + x2) / 2;

          return (
            <path
              key={`${edge.from}>${edge.to}`}
              data-edge={`${edge.from}>${edge.to}`}
              d={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`}
              fill="none"
              strokeWidth={1.5}
              className="stroke-faint"
            />
          );
        })}
        {layout.nodes.map((node) => (
          <g key={node.key} transform={`translate(${node.x} ${node.y})`}>
            <rect
              width={w}
              height={h}
              rx={8}
              strokeWidth={1}
              className="fill-surface stroke-line"
            />
            <text
              x={w / 2}
              y={h / 2}
              textAnchor="middle"
              dominantBaseline="central"
              className="fill-fg font-data text-xs"
            >
              {node.key}
            </text>
          </g>
        ))}
      </svg>
    </ScrollArea>
  );
}
