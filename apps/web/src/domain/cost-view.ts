/**
 * What the Cost screen says about a report: the chart series, the coverage sentence, the lists.
 *
 * Why: Forge records a run's cost only when the harness reports one, and tokens per model but
 *   no prices. So the screen must never imply a complete bill: the per-day series turns to
 *   "no data" when no run reported cost (instead of a flat row of zeros), the coverage
 *   sentence says how many runs the totals cover, and per-model rows show tokens only. This
 *   module turns a `CostReport` into exactly those words and rows, so the screen is layout and
 *   the honesty rules are testable without a DOM.
 *
 * Exports: coverageNote(), ticketEntries(), runEntries(), harnessEntries(),
 *   modelEntries(), tokenLine(), costParts, splitSeries(), hasRecordedCost(), DIRECTOR_DATING_NOTE.
 * Depends on: @forge/core (types), domain/stats-format, domain/nav-entries, types/chart.types.
 */

import type { CostReport, TokenTotals } from '@forge/core';
import { projectPath } from '#/domain/nav-entries.js';
import { ticketPath } from '#/domain/ticket-paths.js';
import { formatCount, formatTokens, formatUsd, shortDay } from '#/domain/stats-format.js';
import { SPLIT_LABEL } from '#/domain/cost-display.js';
import type { ChartPart, ChartPoint, RankEntry } from '#/types/chart.types.js';

/** Workers at the bottom of every bar, the Director on top: one order and one pair of colours on every screen. */
export const costParts: readonly ChartPart[] = [
  { key: 'workers', label: SPLIT_LABEL.workers, color: 'var(--series-1)' },
  { key: 'director', label: SPLIT_LABEL.director, color: 'var(--series-2)' },
];

/** Said wherever spend is charted by day: the Director's history was kept as one total per card until the ledger began. */
export const DIRECTOR_DATING_NOTE = 'Director spend before 20 Oct is dated by card.';

/** True when a run or a Director step in the window reported a price; without one there is no spend to chart. */
export function hasRecordedCost(report: {
  runs_with_cost: number;
  director_steps_recorded: number;
}): boolean {
  return report.runs_with_cost > 0 || report.director_steps_recorded > 0;
}

/** Spend per day split into Workers and Director; every day is "no data" when nothing reported a cost. */
export function splitSeries(
  perDay: CostReport['per_day_split'],
  recorded: boolean,
): ChartPoint[] {
  return perDay.map((point) => ({
    date: point.date,
    value: recorded ? point.worker_usd + point.director_usd : null,
    parts: [point.worker_usd, point.director_usd],
  }));
}

/**
 * `3 of 5 runs and 12 of 12 Director steps reported cost` plus what that means for the totals.
 * Without Director figures it is the runs-only sentence.
 */
export function coverageNote(
  runsWithCost: number,
  runsTotal: number,
  director?: { recorded: number; total: number },
): string {
  const directorTotal = director?.total ?? 0;

  if (runsTotal === 0 && directorTotal === 0) {
    return 'No runs in this range.';
  }

  const parts = [
    ...(runsTotal > 0
      ? [`${formatCount(runsWithCost)} of ${formatCount(runsTotal)} runs`]
      : []),
    ...(director !== undefined && directorTotal > 0
      ? [
          `${formatCount(director.recorded)} of ${formatCount(directorTotal)} Director steps`,
        ]
      : []),
  ];

  const head = `${parts.join(' and ')} reported cost`;
  const recorded = runsWithCost + (director?.recorded ?? 0);
  const total = runsTotal + directorTotal;

  if (recorded === 0) {
    return `${head}. There is no spend to show.`;
  }

  return recorded < total
    ? `${head}. Spend covers only those${directorTotal === 0 ? ' runs' : ''}.`
    : `${head}.`;
}

export const tokenLine = (t: TokenTotals): string =>
  `${formatTokens(t.in)} new · ${formatTokens(t.out)} written · ${formatTokens(t.cached_in)} re-read from cache`;

export function ticketEntries(slug: string, report: CostReport): RankEntry[] {
  return report.by_ticket.map((t) => ({
    key: t.ticket_id,
    title: t.title ? `${t.ticket_id} ${t.title}` : t.ticket_id,
    detail: `${t.runs} ${t.runs === 1 ? 'run' : 'runs'} · ${tokenLine(t.tokens)}`,
    value: formatUsd(t.cost_usd),
    to: ticketPath(slug, t.ticket_id),
  }));
}

export function runEntries(slug: string, report: CostReport): RankEntry[] {
  return report.by_run.map((r) => ({
    key: r.run_id,
    title: `${r.ticket_id} · ${r.run_id}`,
    detail: `${r.harness} · ${shortDay(r.started_at.slice(0, 10))} · ${tokenLine(r.tokens)}`,
    value: r.cost_usd === null ? 'no cost' : formatUsd(r.cost_usd),
    to: `${projectPath(slug, 'runs')}?run=${encodeURIComponent(r.run_id)}`,
  }));
}

export function harnessEntries(report: CostReport): RankEntry[] {
  return report.by_harness.map((h) => ({
    key: h.harness,
    title: h.harness,
    detail: `${h.runs} ${h.runs === 1 ? 'run' : 'runs'} with cost · ${tokenLine(h.tokens)}`,
    value: formatUsd(h.cost_usd),
  }));
}

/** Tokens only: Forge keeps no price table, so no dollar figure is invented per model. */
export function modelEntries(report: CostReport): RankEntry[] {
  return report.by_model.map((m) => ({
    key: m.model,
    title: m.model,
    detail: tokenLine(m.tokens),
    value: `${formatTokens(m.tokens.in + m.tokens.out)} tokens`,
  }));
}
