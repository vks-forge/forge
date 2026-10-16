/**
 * Layout maths for the Overview charts: stacked and grouped bars, donut arcs, sparklines.
 *
 * Why: the charts are hand-drawn SVG (no chart library, code.md rule 11), so the heights,
 *   offsets and arc lengths are computed here, away from React, where tests can pin what the
 *   eye relies on: stacked segments add up to the bucket total, no bar is taller than the
 *   plot, a zero value draws nothing (never a sliver that reads as data), and donut shares
 *   sum to the whole ring. A chart where those drift would show money or runs that are not there.
 *
 * Exports: SLOT_WIDTH, PLOT_HEIGHT, layoutBars(), donutArcs(), sparkPoints().
 * Depends on: types/overview.types. Pure.
 */

import type {
  BarMode,
  BarSegment,
  BucketBars,
  ChartSeries,
  DonutArc,
  StackLayout,
} from '#/types/overview.types.js';

/** Width of one bucket slot in viewBox units. */
export const SLOT_WIDTH = 10;
/** Height of the plot in viewBox units. */
export const PLOT_HEIGHT = 100;

const BAR_FILL = 0.8;

/**
 * Bars for `series` over `count` buckets. Stacked: one bar per bucket, segments piled in series
 * order from the baseline. Grouped: one bar per series side by side inside the slot.
 */
export function layoutBars(
  series: readonly ChartSeries[],
  count: number,
  mode: BarMode,
): StackLayout {
  const valueAt = (s: ChartSeries, i: number): number => Math.max(0, s.values[i] ?? 0);
  const totals = Array.from({ length: count }, (_, i) =>
    series.reduce((sum, s) => sum + valueAt(s, i), 0),
  );

  const peak = Math.max(
    0,
    ...Array.from({ length: count }, (_, i) =>
      mode === 'stacked'
        ? (totals[i] ?? 0)
        : Math.max(0, ...series.map((s) => valueAt(s, i))),
    ),
  );

  const barWidth = SLOT_WIDTH * BAR_FILL;
  const bars: BucketBars[] = Array.from({ length: count }, (_, i) => {
    const slotX = i * SLOT_WIDTH + (SLOT_WIDTH - barWidth) / 2;
    const segments: BarSegment[] = [];
    let used = 0;

    series.forEach((s, n) => {
      const value = valueAt(s, i);
      if (value === 0 || peak === 0) {
        return;
      }

      const height = (value / peak) * PLOT_HEIGHT;
      const width = mode === 'stacked' ? barWidth : barWidth / series.length;
      const x = mode === 'stacked' ? slotX : slotX + n * width;
      const y = PLOT_HEIGHT - (mode === 'stacked' ? used + height : height);

      segments.push({ series: s.key, value, x, y, width, height });
      used += height;
    });

    return { index: i, total: totals[i] ?? 0, segments };
  });

  return { max: peak, bars, width: count * SLOT_WIDTH, height: PLOT_HEIGHT };
}

/** Consecutive arcs, each `length` percent of the ring, for the non-zero values. */
export function donutArcs(
  slices: readonly { readonly key: string; readonly value: number }[],
): DonutArc[] {
  const total = slices.reduce((sum, s) => sum + Math.max(0, s.value), 0);
  if (total === 0) {
    return [];
  }

  let start = 0;

  return slices
    .filter((s) => s.value > 0)
    .map((s) => {
      const length = (s.value / total) * 100;
      const arc = { key: s.key, start, length };
      start += length;

      return arc;
    });
}

/** `x,y` pairs for a polyline of `values` across `width` and `height` (top is the maximum). */
export function sparkPoints(
  values: readonly number[],
  width: number,
  height: number,
): string {
  const peak = Math.max(0, ...values);
  const step = values.length > 1 ? width / (values.length - 1) : 0;

  return values
    .map((v, i) => {
      const y = peak === 0 ? height : height - (v / peak) * height;

      return `${(i * step).toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
}
