/**
 * Pins the wording and the colour assignment of the Overview.
 *
 * Why: the Overview shows money and change. A change figure that divides by zero, a bucket
 *   label that names the wrong day because it was formatted in local time instead of the
 *   bucket's UTC day, or two projects sharing one colour in the same chart would each
 *   mislead. These cases fix the wording and keep every project on its own colour.
 *
 * Pins: bucketLabel() per group, spendChange() cases, assignColors() ordering and overflow,
 *   stackedSpend() totals, cost coverage sentence.
 * Depends on: src/domain/overview-view. Pure.
 */

import { describe, expect, it } from 'vitest';
import {
  OTHER_KEY,
  assignColors,
  bucketLabel,
  coverageSentence,
  spendChange,
  totalSpend,
  stackedSpend,
} from '#/domain/overview-view.js';

describe('bucketLabel', () => {
  it('names the bucket by its UTC start date whatever the viewer time zone', () => {
    expect(bucketLabel('2026-10-04', 'day', 'en-US')).toBe('Oct 4');
    expect(bucketLabel('2026-10-12', 'week', 'en-US')).toBe('Week of Oct 12');
    expect(bucketLabel('2026-10-01', 'month', 'en-US')).toBe('Oct 2026');
  });
});

describe('bucketLabel by the hour', () => {
  it('shows the start of the hour as a 24-hour clock time in the viewer zone', () => {
    expect(bucketLabel('2026-10-16T14:00:00.000Z', 'hour', 'en-US', 'UTC')).toBe('14:00');
    expect(bucketLabel('2026-10-16T08:30:00.000Z', 'hour', 'en-US', 'Asia/Kolkata')).toBe(
      '14:00',
    );
  });
});

describe('spendChange for Today', () => {
  it('names yesterday so far instead of the previous period', () => {
    expect(spendChange(12, 10, true)).toBe('+20% vs yesterday so far');
    expect(spendChange(10, 10, true)).toBe('Same as yesterday so far');
    expect(spendChange(3, 0, true)).toBe('No spend yesterday so far');
  });
});

describe('totalSpend', () => {
  it('sums the projects bucket by bucket into one series', () => {
    const [series] = totalSpend([
      { project: 'a', values: [1, 0, 2] },
      { project: 'b', values: [0.5, 0, 1] },
    ]);

    expect(series?.values).toEqual([1.5, 0, 3]);
    expect(totalSpend([])[0]?.values).toEqual([]);
  });
});

describe('spendChange', () => {
  it('shows a signed percentage against the previous period', () => {
    expect(spendChange(12, 10)).toBe('+20% vs previous period');
    expect(spendChange(5, 10)).toBe('−50% vs previous period');
    expect(spendChange(10, 10)).toBe('Same as the previous period');
  });

  it('says so when there is nothing to compare with', () => {
    expect(spendChange(5, null)).toBeNull();
    expect(spendChange(5, 0)).toBe('No spend in the previous period');
    expect(spendChange(0, 0)).toBe('No spend in the previous period');
  });
});

describe('assignColors', () => {
  it('gives the biggest keys their own colour and folds the rest into Other', () => {
    const keys = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const colors = assignColors(keys);

    expect(colors.get('a')).toBe('var(--series-1)');
    expect(colors.get('f')).toBe('var(--series-6)');
    expect(colors.get('g')).toBe(colors.get(OTHER_KEY));
    expect(colors.get('h')).toBe(colors.get(OTHER_KEY));
    expect(new Set(['a', 'b', 'c', 'd', 'e', 'f'].map((k) => colors.get(k))).size).toBe(
      6,
    );
  });
});

describe('stackedSpend', () => {
  it('keeps the largest projects and sums the others, bucket by bucket', () => {
    const series = stackedSpend(
      [
        { project: 'a', values: [1, 0] },
        { project: 'b', values: [2, 2] },
        { project: 'c', values: [0, 3] },
      ],
      [
        { key: 'c', usd: 3 },
        { key: 'b', usd: 4 },
        { key: 'a', usd: 1 },
      ],
      2,
    );

    expect(series.map((s) => s.key)).toEqual(['b', 'c', OTHER_KEY]);
    expect(series.find((s) => s.key === OTHER_KEY)?.values).toEqual([1, 0]);
  });
});

describe('coverageSentence', () => {
  it('says how many runs reported a cost and never estimates the rest', () => {
    expect(coverageSentence({ runs_total: 6, runs_with_cost: 5 })).toBe(
      '5 of 6 runs reported a cost',
    );

    expect(coverageSentence({ runs_total: 0, runs_with_cost: 0 })).toBe(
      'No runs in this range',
    );
  });
});
