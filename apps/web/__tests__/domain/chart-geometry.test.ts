/**
 * Pins the layout maths of the Overview charts.
 *
 * Why: the charts are hand-drawn, so a segment that does not add up or a bar taller than its
 *   plot would show money or runs that are not there. A zero must draw nothing, and the
 *   donut must always sum to the whole ring.
 *
 * Pins: stacked segments sum to the bucket total, grouped bars sit side by side, nothing
 *   exceeds the plot, zeros draw nothing, donut shares sum to 100, sparkline scaling.
 * Depends on: src/domain/chart-geometry, fast-check. Pure.
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  PLOT_HEIGHT,
  SLOT_WIDTH,
  donutArcs,
  layoutBars,
  sparkPoints,
} from '#/domain/chart-geometry.js';
import type { ChartSeries } from '#/types/overview.types.js';

const series = (key: string, values: number[]): ChartSeries => ({
  key,
  label: key,
  color: 'var(--series-1)',
  values,
});

describe('layoutBars', () => {
  it('stacks segments up from the baseline to the bucket total', () => {
    const layout = layoutBars([series('a', [1, 0]), series('b', [3, 2])], 2, 'stacked');

    expect(layout.max).toBe(4);
    expect(layout.bars[0]?.total).toBe(4);
    expect(layout.bars[0]?.segments.map((s) => s.height)).toEqual([25, 75]);
    expect(layout.bars[0]?.segments[1]?.y).toBe(0);
    expect(layout.bars[0]?.segments[0]?.y).toBe(75);
  });

  it('draws nothing for a zero and nothing at all when every value is zero', () => {
    const layout = layoutBars([series('a', [0, 0])], 2, 'stacked');

    expect(layout.max).toBe(0);
    expect(layout.bars.flatMap((b) => b.segments)).toEqual([]);
  });

  it('puts grouped bars side by side inside the slot, scaled to the largest single value', () => {
    const layout = layoutBars([series('a', [2]), series('b', [4])], 1, 'grouped');
    const [a, b] = layout.bars[0]?.segments ?? [];

    expect(layout.max).toBe(4);
    expect(a?.height).toBe(50);
    expect(b?.height).toBe(100);
    expect((b?.x ?? 0) - (a?.x ?? 0)).toBeCloseTo(a?.width ?? 0);
  });

  it('keeps every segment inside the plot and every stack equal to its total', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.array(fc.integer({ min: 0, max: 1000 }), { minLength: 1, maxLength: 12 }),
          { minLength: 1, maxLength: 5 },
        ),
        fc.constantFrom('stacked' as const, 'grouped' as const),
        (rows, mode) => {
          const count = Math.min(...rows.map((r) => r.length));
          const layout = layoutBars(
            rows.map((values, i) => series(`s${i}`, values.slice(0, count))),
            count,
            mode,
          );

          expect(layout.width).toBe(count * SLOT_WIDTH);

          for (const bar of layout.bars) {
            for (const s of bar.segments) {
              expect(s.y).toBeGreaterThanOrEqual(-1e-9);
              expect(s.y + s.height).toBeLessThanOrEqual(PLOT_HEIGHT + 1e-9);
            }

            if (mode === 'stacked' && layout.max > 0) {
              const stacked = bar.segments.reduce((sum, s) => sum + s.height, 0);

              expect(stacked).toBeCloseTo((bar.total / layout.max) * PLOT_HEIGHT);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('donutArcs', () => {
  it('lays non-zero slices end to end around the ring', () => {
    const arcs = donutArcs([
      { key: 'a', value: 1 },
      { key: 'z', value: 0 },
      { key: 'b', value: 3 },
    ]);

    expect(arcs).toEqual([
      { key: 'a', start: 0, length: 25 },
      { key: 'b', start: 25, length: 75 },
    ]);
  });

  it('is empty when there is nothing to show and sums to the whole ring otherwise', () => {
    expect(donutArcs([{ key: 'a', value: 0 }])).toEqual([]);

    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 500 }), { minLength: 1, maxLength: 9 }),
        (values) => {
          const arcs = donutArcs(values.map((value, i) => ({ key: `k${i}`, value })));

          expect(arcs.reduce((sum, a) => sum + a.length, 0)).toBeCloseTo(100);
        },
      ),
    );
  });
});

describe('sparkPoints', () => {
  it('puts the peak at the top, zero at the bottom and spans the width', () => {
    expect(sparkPoints([0, 2, 1], 100, 10)).toBe('0.00,10.00 50.00,0.00 100.00,5.00');
  });

  it('draws a flat line at the bottom when everything is zero', () => {
    expect(sparkPoints([0, 0], 10, 10)).toBe('0.00,10.00 10.00,10.00');
  });
});
