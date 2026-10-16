/**
 * BucketChart: stacked or side-by-side bars per day, week or month as hand-drawn SVG.
 *
 * Why: the Overview must show how spend, tickets and runs move across projects, and the
 *   existing BarChart draws one series only. A chart library would be a dependency for what is
 *   a row of rectangles (code.md rule 11), so this stacks series (spend by project, runs by
 *   outcome) or groups them (tickets done vs started) in the same hand-drawn style. A bucket
 *   with nothing in it draws nothing, never a sliver that reads as data. Hovering a bucket
 *   lists every series' value in it; the same numbers sit in a visually hidden table, and the
 *   chart is named and described, so nothing is available only as pixels. Bars grow on
 *   `transform` only and not at all under reduced motion (MotionConfig). The SVG stretches to
 *   its box, so 375 px phones to wide monitors never scroll sideways.
 *
 * Exports: BucketChart.
 * Depends on: motion/react, theme/motion, domain/chart-geometry, domain/overview-view,
 *   components/charts/chart-legend, types/overview.types.
 */

import type { StatsGroup } from '@forge/core';
import { motion } from 'motion/react';
import { useId, useState } from 'react';
import type { PointerEvent } from 'react';
import { ChartLegend } from '#/components/charts/chart-legend.js';
import { PLOT_HEIGHT, layoutBars } from '#/domain/chart-geometry.js';
import { bucketLabel } from '#/domain/overview-view.js';
import { springs } from '#/theme/motion.js';
import type { BarMode, ChartSeries } from '#/types/overview.types.js';

export function BucketChart(props: {
  title: string;
  buckets: readonly string[];
  group: StatsGroup;
  series: readonly ChartSeries[];
  mode: BarMode;
  format: (value: number) => string;
  /** Shown instead of the plot when nothing was recorded. */
  noData: string;
  /** Extra line under the title, such as how complete the figures are. */
  note?: string | undefined;
}) {
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  const count = props.buckets.length;
  const layout = layoutBars(props.series, count, props.mode);
  const total = props.series.reduce(
    (sum, s) => sum + s.values.reduce((a, b) => a + b, 0),
    0,
  );

  const label = (index: number): string =>
    bucketLabel(props.buckets[index] ?? '', props.group);

  const first = label(0);
  const last = label(count - 1);
  const summary =
    total === 0
      ? props.noData
      : `${count} buckets from ${first} to ${last}. Total ${props.format(total)}, tallest ${props.format(layout.max)}.`;

  function track(event: PointerEvent<HTMLDivElement>): void {
    const box = event.currentTarget.getBoundingClientRect();
    const at = Math.floor(((event.clientX - box.left) / Math.max(1, box.width)) * count);

    setHover(Math.min(count - 1, Math.max(0, at)));
  }

  const hovered = hover === null ? undefined : layout.bars[hover];

  return (
    <figure className="grid min-w-0 content-start gap-2">
      <figcaption className="grid gap-0.5">
        <span className="text-sm font-medium">{props.title}</span>
        {props.note ? <span className="text-xs text-muted">{props.note}</span> : null}
      </figcaption>

      {total === 0 ? (
        <p className="grid h-36 place-items-center rounded-lg bg-hover px-3 text-center text-sm text-muted">
          {props.noData}
        </p>
      ) : (
        <>
          <div
            className="relative"
            onPointerMove={track}
            onPointerLeave={() => setHover(null)}
          >
            <svg
              role="img"
              aria-labelledby={`${id}-t`}
              aria-describedby={`${id}-d`}
              viewBox={`0 0 ${layout.width} ${PLOT_HEIGHT}`}
              preserveAspectRatio="none"
              className="h-36 w-full overflow-hidden"
            >
              <title id={`${id}-t`}>{props.title}</title>
              <desc id={`${id}-d`}>{summary}</desc>
              {hover === null ? null : (
                <rect
                  x={hover * (layout.width / count)}
                  y={0}
                  width={layout.width / count}
                  height={PLOT_HEIGHT}
                  fill="var(--hover)"
                />
              )}
              <line
                x1={0}
                x2={layout.width}
                y1={PLOT_HEIGHT - 0.5}
                y2={PLOT_HEIGHT - 0.5}
                stroke="var(--line)"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
              {layout.bars.flatMap((bar) =>
                bar.segments.map((seg) => (
                  <motion.rect
                    key={`${bar.index}-${seg.series}`}
                    x={seg.x}
                    y={seg.y}
                    width={seg.width}
                    height={seg.height}
                    fill={props.series.find((s) => s.key === seg.series)?.color}
                    initial={{ scaleY: 0 }}
                    animate={{ scaleY: 1 }}
                    transition={springs.gentle}
                    style={{ transformBox: 'fill-box', transformOrigin: '50% 100%' }}
                  />
                )),
              )}
            </svg>
            {hovered ? (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute top-0 z-10 grid min-w-36 -translate-x-1/2 gap-1 rounded-lg border border-line bg-surface p-2 text-xs shadow-float"
                style={{
                  left: `clamp(4.5rem, ${((hovered.index + 0.5) / count) * 100}%, calc(100% - 4.5rem))`,
                }}
              >
                <span className="font-medium">{label(hovered.index)}</span>
                {props.series.map((s) => {
                  const value = s.values[hovered.index] ?? 0;

                  return value === 0 ? null : (
                    <span key={s.key} className="flex items-center justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span
                          className="size-2 shrink-0 rounded-sm"
                          style={{ backgroundColor: s.color }}
                        />
                        <span className="truncate text-muted">{s.label}</span>
                      </span>
                      <span className="font-data tabular-nums">
                        {props.format(value)}
                      </span>
                    </span>
                  );
                })}
                {props.mode === 'stacked' && props.series.length > 1 ? (
                  <span className="flex justify-between gap-3 border-t border-line pt-1 font-medium">
                    <span>Total</span>
                    <span className="font-data tabular-nums">
                      {props.format(hovered.total)}
                    </span>
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
          <p
            aria-hidden="true"
            className="flex justify-between gap-2 font-data text-xs text-muted"
          >
            <span className="truncate">{first}</span>
            <span className="shrink-0">Tallest {props.format(layout.max)}</span>
            <span className="truncate text-right">{last}</span>
          </p>
          <ChartLegend
            items={props.series.map((s) => ({
              key: s.key,
              label: s.label,
              color: s.color,
            }))}
          />
        </>
      )}

      <div className="sr-only">
        <table>
          <caption>{props.title}</caption>
          <thead>
            <tr>
              <th scope="col">Period</th>
              {props.series.map((s) => (
                <th key={s.key} scope="col">
                  {s.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {props.buckets.map((bucket, i) => (
              <tr key={bucket}>
                <th scope="row">{label(i)}</th>
                {props.series.map((s) => (
                  <td key={s.key}>{props.format(s.values[i] ?? 0)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
