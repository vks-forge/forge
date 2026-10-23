/**
 * Overview wording and colours: bucket labels, change vs the previous period, series colours.
 *
 * Why: the Overview shows money across projects and must read it honestly. A bucket is a UTC
 *   day, week or month (an hour of Today is a clock time), so its label is formatted in UTC (in the browser's own language and
 *   date style) or a viewer west of Greenwich would see the day before. A change figure
 *   against a previous period with no spend must say so, not divide by zero. Every project in
 *   a chart gets its own colour from the same ordered list in every chart, and only the
 *   biggest few keep one: the rest fold into one "Other" series so a legend stays readable
 *   and no two lines share a colour.
 *
 * Exports: sourceSpend(), OTHER_KEY, SERIES_COUNT, bucketLabel(), spendChange(), totalSpend(), assignColors(),
 *   stackedSpend(), donutSlices(), coverageSentence().
 * Depends on: @forge/core (types), types/overview.types. Pure.
 */

import type {
  CostCoverage,
  OverviewProjectSeries,
  OverviewSourceSeries,
  OverviewSpendSlice,
  StatsGroup,
} from '@forge/core';
import type { ChartPart } from '#/types/chart.types.js';
import type { ChartSeries, DonutSlice } from '#/types/overview.types.js';

export const OTHER_KEY = '__other';
/** Series colours defined in theme/tokens.css (`--series-1` to `--series-6`). */
export const SERIES_COUNT = 6;

const OTHER_COLOR = 'var(--faint)';

/**
 * The label of a bucket start for its grouping: a UTC date (`YYYY-MM-DD`) for day, week and
 * month, and for hour the ISO instant the hour starts, shown as a 24-hour clock time in the
 * viewer's own zone ("14:00"; `timeZone` is only for tests).
 */
export function bucketLabel(
  key: string,
  group: StatsGroup,
  locale?: string,
  timeZone?: string,
): string {
  if (group === 'hour') {
    const instant = new Date(key);

    return Number.isNaN(instant.getTime())
      ? key
      : new Intl.DateTimeFormat(locale, {
          hour: '2-digit',
          minute: '2-digit',
          hourCycle: 'h23',
          ...(timeZone ? { timeZone } : {}),
        }).format(instant);
  }

  const date = new Date(`${key}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    return key;
  }

  if (group === 'month') {
    return new Intl.DateTimeFormat(locale, {
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(date);
  }

  const day = new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(date);

  return group === 'week' ? `Week of ${day}` : day;
}

/**
 * "+20% vs previous period"; null when there is no previous period (all time). For Today the
 * comparison is yesterday up to the same time of day and the words say so.
 */
export function spendChange(
  current: number,
  previous: number | null,
  today = false,
): string | null {
  if (previous === null) {
    return null;
  }

  const against = today ? 'yesterday so far' : 'previous period';

  if (previous === 0) {
    return today ? 'No spend yesterday so far' : 'No spend in the previous period';
  }

  const percent = Math.round(((current - previous) / previous) * 100);
  if (percent === 0) {
    return `Same as ${today ? 'yesterday so far' : 'the previous period'}`;
  }

  return `${percent > 0 ? '+' : '−'}${Math.abs(percent)}% vs ${against}`;
}

/** One spend series for a single project (or all of them summed): per-bucket totals. */
export function totalSpend(byProject: readonly OverviewProjectSeries[]): ChartSeries[] {
  const buckets = byProject[0]?.values.length ?? 0;

  return [
    {
      key: 'spend',
      label: 'Spend',
      color: 'var(--series-1)',
      values: Array.from({ length: buckets }, (_, i) =>
        byProject.reduce((sum, p) => sum + (p.values[i] ?? 0), 0),
      ),
    },
  ];
}

/** Colours for `keys` (biggest first): the first six get their own, the rest and Other share grey. */
export function assignColors(
  keys: readonly string[],
  own = SERIES_COUNT,
): Map<string, string> {
  const colors = new Map<string, string>();

  keys.forEach((key, i) =>
    colors.set(key, i < own ? `var(--series-${i + 1})` : OTHER_COLOR),
  );

  colors.set(OTHER_KEY, OTHER_COLOR);

  return colors;
}

/**
 * The stacked spend series: the `keep` biggest projects by total spend in that order, then one
 * "Other projects" series summing the rest, each with one value per bucket.
 */
export function stackedSpend(
  byProject: readonly OverviewProjectSeries[],
  totals: readonly OverviewSpendSlice[],
  keep = SERIES_COUNT,
): ChartSeries[] {
  const ranked = [...totals].sort((a, b) => b.usd - a.usd).map((t) => t.key);
  const colors = assignColors(ranked, keep);
  const valuesOf = new Map(byProject.map((p) => [p.project, p.values]));
  const buckets = byProject[0]?.values.length ?? 0;
  const series: ChartSeries[] = ranked.slice(0, keep).map((key) => ({
    key,
    label: key,
    color: colors.get(key) ?? OTHER_COLOR,
    values: valuesOf.get(key) ?? [],
  }));

  const rest = ranked.slice(keep);
  if (rest.length > 0) {
    series.push({
      key: OTHER_KEY,
      label: 'Other projects',
      color: OTHER_COLOR,
      values: Array.from({ length: buckets }, (_, i) =>
        rest.reduce((sum, key) => sum + (valuesOf.get(key)?.[i] ?? 0), 0),
      ),
    });
  }

  return series;
}

/** Donut slices, biggest first: the `keep` biggest keep their colour, the rest fold into one grey slice. */
export function donutSlices(
  totals: readonly OverviewSpendSlice[],
  otherLabel = 'Other',
  keep = SERIES_COUNT,
): DonutSlice[] {
  const ranked = [...totals].sort((a, b) => b.usd - a.usd);
  const colors = assignColors(
    ranked.map((t) => t.key),
    keep,
  );

  const slices = ranked.slice(0, keep).map((t) => ({
    key: t.key,
    label: t.key,
    value: t.usd,
    color: colors.get(t.key) ?? OTHER_COLOR,
  }));

  const rest = ranked.slice(keep).reduce((sum, t) => sum + t.usd, 0);

  return rest > 0
    ? [...slices, { key: OTHER_KEY, label: otherLabel, value: rest, color: OTHER_COLOR }]
    : slices;
}

/** "5 of 6 runs reported a cost"; the rest are counted, never estimated. */
export function coverageSentence(
  coverage: CostCoverage & {
    director_steps?: number;
    director_steps_recorded?: number;
  },
): string {
  const steps = coverage.director_steps ?? 0;

  if (coverage.runs_total === 0 && steps === 0) {
    return 'No runs in this range';
  }

  const runs = `${coverage.runs_with_cost} of ${coverage.runs_total} runs`;

  return steps === 0
    ? `${runs} reported a cost`
    : `${runs} and ${coverage.director_steps_recorded ?? 0} of ${steps} Director steps reported a cost`;
}

/**
 * Spend over time as the two sources, named and coloured like every other split: the series of
 * `parts` in order, each with the server's per-bucket values (empty when the server sent none).
 */
export function sourceSpend(
  bySource: readonly OverviewSourceSeries[],
  parts: readonly ChartPart[],
): ChartSeries[] {
  const wanted = { workers: 'worker', director: 'director' } as const;

  return parts.map((part) => ({
    key: part.key,
    label: part.label,
    color: part.color,
    values:
      bySource.find((series) => series.source === wanted[part.key as keyof typeof wanted])
        ?.values ?? [],
  }));
}
