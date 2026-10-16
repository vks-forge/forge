/**
 * Sparkline: a tiny line of activity for one row of the projects table.
 *
 * Why: a table row says how much a project did; the line says whether that is rising or
 *   fading, in a space no larger than a word. It is a picture of numbers the row already
 *   writes out elsewhere, so it is named for assistive tech with its total and peak instead
 *   of being read out point by point. A flat line at the baseline means nothing happened,
 *   which is true, not an error.
 *
 * Exports: Sparkline.
 * Depends on: domain/chart-geometry.
 */

import { sparkPoints } from '#/domain/chart-geometry.js';

const WIDTH = 80;
const HEIGHT = 20;

export function Sparkline(props: { label: string; values: readonly number[] }) {
  const total = props.values.reduce((sum, v) => sum + v, 0);
  const peak = Math.max(0, ...props.values);

  return (
    <svg
      role="img"
      aria-label={`${props.label}: ${total} in total, most in one period ${peak}`}
      viewBox={`0 -1 ${WIDTH} ${HEIGHT + 2}`}
      className="h-5 w-20 overflow-visible"
    >
      <polyline
        points={sparkPoints(props.values, WIDTH, HEIGHT)}
        fill="none"
        stroke={total === 0 ? 'var(--line)' : 'var(--signal)'}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
