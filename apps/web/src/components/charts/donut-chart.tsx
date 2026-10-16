/**
 * DonutChart: where the money went, as a ring with the amounts written beside it.
 *
 * Why: the Overview breaks spend down by project, by harness and by lane. The ring gives the
 *   proportions at a glance, but a ring alone hides small slices and cannot be read by screen
 *   readers, so every slice is also a row (swatch, name, amount, share) and the ring itself is
 *   decorative. Only recorded cost is in it: the centre says the total, and with nothing
 *   recorded the ring is replaced by a plain sentence rather than an empty circle. Slices
 *   draw instantly (no spin-up) so the figure is readable the moment the page is.
 *
 * Exports: DonutChart.
 * Depends on: domain/chart-geometry, types/overview.types.
 */

import { donutArcs } from '#/domain/chart-geometry.js';
import type { DonutSlice } from '#/types/overview.types.js';

const RADIUS = 15.9155;

export function DonutChart(props: {
  title: string;
  slices: readonly DonutSlice[];
  format: (value: number) => string;
  noData: string;
}) {
  const total = props.slices.reduce((sum, s) => sum + s.value, 0);
  const arcs = donutArcs(props.slices);
  const colorOf = new Map(props.slices.map((s) => [s.key, s.color]));

  return (
    <figure className="grid min-w-0 content-start gap-3">
      <figcaption className="text-sm font-medium">{props.title}</figcaption>

      {total === 0 ? (
        <p className="grid h-28 place-items-center rounded-lg bg-hover px-3 text-center text-sm text-muted">
          {props.noData}
        </p>
      ) : (
        <div className="flex min-w-0 flex-wrap items-center gap-4">
          <div className="relative size-28 shrink-0">
            <svg
              aria-hidden="true"
              viewBox="0 0 42 42"
              className="size-full -rotate-90"
              focusable="false"
            >
              <circle
                cx={21}
                cy={21}
                r={RADIUS}
                fill="none"
                stroke="var(--hover)"
                strokeWidth={6}
              />
              {arcs.map((arc) => (
                <circle
                  key={arc.key}
                  cx={21}
                  cy={21}
                  r={RADIUS}
                  fill="none"
                  stroke={colorOf.get(arc.key)}
                  strokeWidth={6}
                  pathLength={100}
                  strokeDasharray={`${arc.length} ${100 - arc.length}`}
                  strokeDashoffset={-arc.start}
                />
              ))}
            </svg>
            <span className="absolute inset-0 grid place-items-center font-data text-sm font-medium tabular-nums">
              {props.format(total)}
            </span>
          </div>
          <ul aria-label={props.title} className="grid min-w-40 flex-1 gap-1 text-xs">
            {props.slices
              .filter((s) => s.value > 0)
              .map((s) => (
                <li key={s.key} className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span
                      aria-hidden="true"
                      className="size-2.5 shrink-0 rounded-sm"
                      style={{ backgroundColor: s.color }}
                    />
                    <span className="truncate text-muted">{s.label}</span>
                  </span>
                  <span className="shrink-0 font-data tabular-nums">
                    {props.format(s.value)}
                    <span className="ml-1.5 text-muted">
                      {Math.round((s.value / total) * 100)}%
                    </span>
                  </span>
                </li>
              ))}
          </ul>
        </div>
      )}
    </figure>
  );
}
