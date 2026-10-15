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
 * Exports: costSeries(), coverageNote(), ticketEntries(), runEntries(), harnessEntries(),
 *   modelEntries(), tokenLine().
 * Depends on: @forge/core (types), domain/stats-format, domain/nav-entries, types/chart.types.
 */

import type { CostReport, TokenTotals } from '@forge/core';
import { projectPath } from '#/domain/nav-entries.js';
import { ticketPath } from '#/domain/ticket-paths.js';
import { formatCount, formatTokens, formatUsd, shortDay } from '#/domain/stats-format.js';
import type { ChartPoint, RankEntry } from '#/types/chart.types.js';

/** Spend per day; every day is "no data" when no run in the window reported a cost. */
export function costSeries(
  perDay: CostReport['per_day'],
  runsWithCost: number,
): ChartPoint[] {
  return perDay.map((point) => ({
    date: point.date,
    value: runsWithCost === 0 ? null : point.value,
  }));
}

/** `3 of 5 runs reported cost` plus what that means for the totals. */
export function coverageNote(runsWithCost: number, runsTotal: number): string {
  if (runsTotal === 0) {
    return 'No runs in this range.';
  }

  const head = `${formatCount(runsWithCost)} of ${formatCount(runsTotal)} runs reported cost`;

  if (runsWithCost === 0) {
    return `${head}. There is no spend to show.`;
  }

  return runsWithCost < runsTotal ? `${head}. Spend covers only those runs.` : `${head}.`;
}

export const tokenLine = (t: TokenTotals): string =>
  `in ${formatTokens(t.in)} · out ${formatTokens(t.out)} · cached ${formatTokens(t.cached_in)}`;

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
