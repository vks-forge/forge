/**
 * BarChart: one value per day as hand-drawn SVG bars, with a table for screen readers.
 *
 * Why: Home and Cost answer "is this going up or down?" with daily figures. A chart library
 *   would add a dependency for what is a row of rectangles (code.md rule 11), and a generic
 *   one would draw a missing day as a zero. Here a `null` point is drawn as a dotted tick (no
 *   data), a real zero as a short solid tick, and the peak and the first and last day are
 *   written out so the shape is readable without hovering. The SVG stretches to its box (375 px
 *   to desktop, no horizontal scroll); it is named and described for assistive tech, and the
 *   same numbers sit in a visually hidden table so nothing is available only as pixels. Bars
 *   grow with a spring on `transform` only, and not at all under reduced motion. Today's bar
 *   takes the signal colour; the rest use the quiet chart colour.
 *
 * Exports: BarChart.
 * Depends on: motion/react, theme/motion, domain/stats-format, types/chart.types.
 */

import { motion } from 'motion/react';
import { useId } from 'react';
import { shortDay } from '#/domain/stats-format.js';
import { springs } from '#/theme/motion.js';
import type { ChartPoint } from '#/types/chart.types.js';

const SLOT = 10;
const HEIGHT = 100;
const PLOT = 90;
const MIN_BAR = 2;

export function BarChart(props: {
  title: string;
  points: readonly ChartPoint[];
  format: (value: number) => string;
  /** Text shown instead of the plot when no point has data. */
  noData: string;
}) {
  const id = useId();
  const known = props.points.filter(
    (p): p is { date: string; value: number } => p.value !== null,
  );

  const max = known.reduce((peak, p) => Math.max(peak, p.value), 0);
  const total = known.reduce((sum, p) => sum + p.value, 0);
  const first = props.points[0];
  const last = props.points[props.points.length - 1];
  const summary =
    known.length === 0
      ? props.noData
      : `${props.points.length} days from ${shortDay(first?.date ?? '')} to ${shortDay(last?.date ?? '')}. Total ${props.format(total)}, peak ${props.format(max)}.`;

  return (
    <figure className="grid min-w-0 gap-2">
      <figcaption className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium">{props.title}</span>
        <span className="font-data text-xs text-muted">
          {known.length === 0 ? 'No data' : `Total ${props.format(total)}`}
        </span>
      </figcaption>

      {known.length === 0 ? (
        <p className="grid h-28 place-items-center rounded-lg bg-hover px-3 text-center text-sm text-muted">
          {props.noData}
        </p>
      ) : (
        <>
          <svg
            role="img"
            aria-labelledby={`${id}-t`}
            aria-describedby={`${id}-d`}
            viewBox={`0 0 ${props.points.length * SLOT} ${HEIGHT}`}
            preserveAspectRatio="none"
            className="h-28 w-full overflow-hidden"
          >
            <title id={`${id}-t`}>{props.title}</title>
            <desc id={`${id}-d`}>{summary}</desc>
            <line
              x1={0}
              x2={props.points.length * SLOT}
              y1={HEIGHT - 0.5}
              y2={HEIGHT - 0.5}
              stroke="var(--line)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
            {props.points.map((point, index) => {
              const x = index * SLOT + 1;
              const isToday = index === props.points.length - 1;

              if (point.value === null) {
                return (
                  <line
                    key={point.date}
                    x1={x + 4}
                    x2={x + 4}
                    y1={HEIGHT - 6}
                    y2={HEIGHT - 1}
                    stroke="var(--faint)"
                    strokeWidth={1}
                    strokeDasharray="1 2"
                    vectorEffect="non-scaling-stroke"
                  >
                    <title>{`${shortDay(point.date)}: no data`}</title>
                  </line>
                );
              }

              const height = Math.max(MIN_BAR, max > 0 ? (point.value / max) * PLOT : 0);

              return (
                <motion.rect
                  key={point.date}
                  x={x}
                  y={HEIGHT - height}
                  width={SLOT - 2}
                  height={height}
                  rx={1}
                  fill={isToday ? 'var(--signal)' : 'var(--chart-bar)'}
                  initial={{ scaleY: 0 }}
                  animate={{ scaleY: 1 }}
                  transition={springs.gentle}
                  style={{ transformBox: 'fill-box', transformOrigin: '50% 100%' }}
                >
                  <title>{`${shortDay(point.date)}: ${props.format(point.value)}`}</title>
                </motion.rect>
              );
            })}
          </svg>
          <p
            aria-hidden="true"
            className="flex justify-between gap-2 font-data text-xs text-muted"
          >
            <span>{shortDay(first?.date ?? '')}</span>
            <span>Peak {props.format(max)}</span>
            <span>{shortDay(last?.date ?? '')}</span>
          </p>
        </>
      )}

      <table className="sr-only">
        <caption>{props.title} per day</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">Value</th>
          </tr>
        </thead>
        <tbody>
          {props.points.map((point) => (
            <tr key={point.date}>
              <th scope="row">{shortDay(point.date)}</th>
              <td>{point.value === null ? 'no data' : props.format(point.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
