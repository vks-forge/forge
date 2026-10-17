/**
 * Pins how the Overview cuts a time window into day, week and month buckets.
 *
 * Why: the Overview draws spend and activity per bucket. If two timestamps in the same
 *   UTC day landed in different buckets, a bucket were missing or two overlapped, the chart
 *   would drop or double-count money. These cases and properties fix the rules: buckets are
 *   UTC, weeks start on Monday, months on the 1st, they are contiguous, cover the whole
 *   window and every timestamp inside it has exactly one bucket.
 *
 * Pins: bucketKeyOf() per group, bucketize() coverage, order and uniqueness, bucket counts.
 * Depends on: src/domain/bucketize, fast-check. No IO.
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { bucketKeyOf, bucketize } from '#/domain/bucketize.js';
import type { StatsGroup } from '#/schemas/stats-range.js';

const GROUPS: readonly StatsGroup[] = ['day', 'week', 'month'];
const HOUR_MS = 3_600_000;
const window = (from: string, to: string) => ({ from, to });

describe('bucketKeyOf', () => {
  it('uses the UTC day, the Monday of the week and the first of the month', () => {
    const at = '2026-10-16T23:59:59.000Z';

    expect(bucketKeyOf(at, 'day')).toBe('2026-10-16');
    expect(bucketKeyOf(at, 'week')).toBe('2026-10-12');
    expect(bucketKeyOf(at, 'month')).toBe('2026-10-01');
  });

  it('puts a Sunday in the week that started the Monday before', () => {
    expect(bucketKeyOf('2026-10-18T00:00:00.000Z', 'week')).toBe('2026-10-12');
    expect(bucketKeyOf('2026-10-19T00:00:00.000Z', 'week')).toBe('2026-10-19');
  });
});

describe('hour buckets', () => {
  it('names a bucket by the ISO instant its hour starts', () => {
    expect(bucketKeyOf('2026-10-16T14:59:59.000Z', 'hour')).toBe(
      '2026-10-16T14:00:00.000Z',
    );
  });

  it('aligns hours to the local clock when the offset is not whole hours', () => {
    // India is UTC+5:30: local 14:00 is 08:30 UTC.
    expect(bucketKeyOf('2026-10-16T08:45:00.000Z', 'hour', 330)).toBe(
      '2026-10-16T08:30:00.000Z',
    );

    expect(bucketKeyOf('2026-10-16T08:29:00.000Z', 'hour', 330)).toBe(
      '2026-10-16T07:30:00.000Z',
    );
  });

  it('gives one bucket per hour from local midnight to now', () => {
    const keys = bucketize(
      window('2026-10-15T18:30:00.000Z', '2026-10-16T08:45:00.000Z'),
      'hour',
      330,
    );

    expect(keys).toHaveLength(15);
    expect(keys[0]).toBe('2026-10-15T18:30:00.000Z');
    expect(keys.at(-1)).toBe('2026-10-16T08:30:00.000Z');
  });

  it('is contiguous hour by hour and covers every instant, at any offset', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: Date.parse('2020-01-01'), max: Date.parse('2030-01-01') }),
        fc.integer({ min: 0, max: 72 * HOUR_MS }),
        fc.integer({ min: -12 * 2, max: 14 * 2 }).map((half) => half * 30),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (start, span, offset, at) => {
          const from = new Date(start).toISOString();
          const to = new Date(start + span).toISOString();
          const keys = bucketize({ from, to }, 'hour', offset);

          expect(keys[0]).toBe(bucketKeyOf(from, 'hour', offset));
          expect(keys.at(-1)).toBe(bucketKeyOf(to, 'hour', offset));

          for (let i = 1; i < keys.length; i += 1) {
            expect(Date.parse(keys[i] ?? '') - Date.parse(keys[i - 1] ?? '')).toBe(
              HOUR_MS,
            );
          }

          const inside = new Date(start + Math.floor(at * span)).toISOString();
          expect(keys).toContain(bucketKeyOf(inside, 'hour', offset));
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe('bucketize', () => {
  it('gives one bucket per day for a 7 day window', () => {
    const keys = bucketize(
      window('2026-10-10T00:00:00.000Z', '2026-10-16T12:00:00.000Z'),
      'day',
    );

    expect(keys).toEqual([
      '2026-10-10',
      '2026-10-11',
      '2026-10-12',
      '2026-10-13',
      '2026-10-14',
      '2026-10-15',
      '2026-10-16',
    ]);
  });

  it('starts a week bucket at the Monday on or before the window start', () => {
    const keys = bucketize(
      window('2026-10-10T00:00:00.000Z', '2026-10-25T00:00:00.000Z'),
      'week',
    );

    expect(keys).toEqual(['2026-10-05', '2026-10-12', '2026-10-19']);
  });

  it('spans a year boundary by month', () => {
    const keys = bucketize(
      window('2025-11-20T00:00:00.000Z', '2026-02-02T00:00:00.000Z'),
      'month',
    );

    expect(keys).toEqual(['2025-11-01', '2025-12-01', '2026-01-01', '2026-02-01']);
  });

  it('returns one bucket when the window is empty', () => {
    const keys = bucketize(
      window('2026-10-16T00:00:00.000Z', '2026-10-16T00:00:00.000Z'),
      'week',
    );

    expect(keys).toEqual(['2026-10-12']);
  });

  it('is contiguous, ordered and unique, and every instant of the window has a bucket', () => {
    const ms = fc.integer({
      min: Date.parse('2020-01-01'),
      max: Date.parse('2030-01-01'),
    });

    fc.assert(
      fc.property(
        ms,
        fc.integer({ min: 0, max: 800 * 86_400_000 }),
        fc.constantFrom(...GROUPS),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (start, span, group, at) => {
          const from = new Date(start).toISOString();
          const to = new Date(start + span).toISOString();
          const keys = bucketize({ from, to }, group);

          expect(new Set(keys).size).toBe(keys.length);
          expect([...keys].sort()).toEqual(keys);
          expect(keys[0]).toBe(bucketKeyOf(from, group));
          expect(keys.at(-1)).toBe(bucketKeyOf(to, group));

          const inside = new Date(start + Math.floor(at * span)).toISOString();
          expect(keys).toContain(bucketKeyOf(inside, group));
        },
      ),
      { numRuns: 200 },
    );
  });

  it('has no gap between consecutive buckets', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: Date.parse('2020-01-01'), max: Date.parse('2030-01-01') }),
        fc.integer({ min: 0, max: 800 * 86_400_000 }),
        fc.constantFrom(...GROUPS),
        (start, span, group) => {
          const keys = bucketize(
            {
              from: new Date(start).toISOString(),
              to: new Date(start + span).toISOString(),
            },
            group,
          );

          for (let i = 1; i < keys.length; i += 1) {
            const prev = Date.parse(`${keys[i - 1]}T00:00:00Z`);
            const next = Date.parse(`${keys[i]}T00:00:00Z`);
            const step = (next - prev) / 86_400_000;

            if (group === 'day') {
              expect(step).toBe(1);
            } else if (group === 'week') {
              expect(step).toBe(7);
            } else {
              expect([28, 29, 30, 31]).toContain(step);
            }
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
