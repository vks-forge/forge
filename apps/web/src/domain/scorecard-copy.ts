/**
 * Scorecard copy: how an agent's or a pipeline shape's record reads, without inventing a number.
 *
 * Why: the owner decides which agent to trust with what, and whether a lane is worth its stages,
 *   from figures computed on finished tickets. Small samples mislead, so a row under the server's
 *   threshold says "Too few tickets to judge" instead of a percentage, a figure with no data is a
 *   dash and the words "No data" (never zero), and cost says how many runs recorded one ("priced
 *   for 3 of 5 runs") because a total over half the runs is not the cost. Writers and testers are
 *   judged by tickets done without rework, checks by rows that passed first time; the verdict
 *   counts are the owner's marks first, then what the pipeline shows. Pure.
 *
 * Exports: SLICE_OPTIONS, rowLabel(), headlineFigure(), reworksText(), costText(), coverageText(),
 *   durationText(), findingsText(), insufficientText(), summaryLine(), RANGE_OPTIONS.
 * Depends on: domain/stats-format, schemas/pipeline-proposals (types and constants).
 */

import { formatDuration, formatPercent, formatUsd } from '#/domain/stats-format.js';
import { MIN_SCORECARD_TICKETS } from '#/schemas/pipeline-proposals.js';
import type { ScorecardRow } from '#/schemas/pipeline-proposals.js';

export const SLICE_OPTIONS = [
  { value: 'all', label: 'All tickets' },
  { value: 'type', label: 'By ticket type' },
  { value: 'tier', label: 'By tier' },
  { value: 'lane', label: 'By lane' },
] as const;

export const RANGE_OPTIONS = [
  { value: '90d', label: 'Last 90 days' },
  { value: '30d', label: 'Last 30 days' },
] as const;

/** "All tickets", "Type: bug", "Tier: B", "Lane: standard". */
export function rowLabel(row: Pick<ScorecardRow, 'by' | 'value'>): string {
  if (row.by === 'all' || row.value === undefined) {
    return 'All tickets';
  }

  const kind = row.by === 'type' ? 'Type' : row.by === 'tier' ? 'Tier' : 'Lane';

  return `${kind}: ${row.value}`;
}

/** "86% (12 of 14)", or "No data" when there was nothing to count. */
function rateText(stat: ScorecardRow['clean_rate']): string {
  return stat === null || stat.rate === null
    ? 'No data'
    : `${formatPercent(stat.rate)} (${stat.hits} of ${stat.total})`;
}

/** The one figure that judges this row: passed first time for a check, done without rework otherwise. */
export function headlineFigure(row: ScorecardRow): { label: string; value: string } {
  return row.pass_rate !== null && row.clean_rate === null
    ? { label: 'Passed first time', value: rateText(row.pass_rate) }
    : { label: 'Done without rework', value: rateText(row.clean_rate) };
}

export function reworksText(row: Pick<ScorecardRow, 'reworks_per_ticket'>): string {
  return row.reworks_per_ticket === null
    ? 'No data'
    : `${row.reworks_per_ticket.toFixed(1)} per ticket`;
}

/** "$0.42 per ticket", or "No cost recorded" while no run recorded one. */
export function costText(row: Pick<ScorecardRow, 'cost'>): string {
  return row.cost.per_ticket_usd === null
    ? 'No cost recorded'
    : `${formatUsd(row.cost.per_ticket_usd)} per ticket`;
}

/** "Priced for 3 of 5 runs": how much of the cost is known. */
export function coverageText(row: Pick<ScorecardRow, 'cost'>): string {
  const { hits, total } = row.cost.coverage;

  return total === 0 ? 'No runs' : `Priced for ${hits} of ${total} runs`;
}

/** "Median 4m 10s, slowest tenth 12m 00s", or "No data". */
export function durationText(row: Pick<ScorecardRow, 'duration'>): string {
  const { median_ms: median, p90_ms: slow } = row.duration;

  return median === null
    ? 'No data'
    : `Median ${formatDuration(median)}${slow === null ? '' : `, slowest tenth ${formatDuration(slow)}`}`;
}

/** "3 real, 1 false alarm, 4 not judged": the verdicts on this row's findings, or `null` without findings. */
export function findingsText(row: Pick<ScorecardRow, 'findings'>): string | null {
  const { findings } = row;

  if (findings === undefined) {
    return null;
  }

  const total = Object.values(findings.by_severity).reduce((sum, n) => sum + n, 0);

  if (total === 0) {
    return 'No findings';
  }

  const parts = [
    `${findings.real} real`,
    `${findings.false_alarm} false alarm`,
    `${findings.acted_on} fixed after rework`,
    `${findings.overruled} overruled`,
    `${findings.unjudged} not judged`,
  ].filter((part) => !part.startsWith('0 '));

  return `${total} found: ${parts.join(', ')}`;
}

export function insufficientText(row: Pick<ScorecardRow, 'tickets'>): string {
  return `Too few tickets to judge (${row.tickets} so far, ${MIN_SCORECARD_TICKETS} needed)`;
}

/** The roster row's one line: the headline figure, reworks and cost, or why there is no verdict. */
export function summaryLine(row: ScorecardRow | undefined): string {
  if (row === undefined || row.tickets === 0) {
    return 'No finished tickets in this window yet';
  }

  if (row.insufficient) {
    return insufficientText(row);
  }

  const head = headlineFigure(row);

  return [
    `${head.label} ${head.value}`,
    row.reworks_per_ticket === null ? null : `Reworks ${reworksText(row)}`,
    costText(row),
    `${row.tickets} tickets`,
  ]
    .filter((part) => part !== null)
    .join(' · ');
}
