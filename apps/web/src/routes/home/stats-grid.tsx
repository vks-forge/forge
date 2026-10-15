/**
 * StatsGrid: the graphs and figures that say how the project is going over a range.
 *
 * Why: the readout is "now"; this is "trend". Three daily charts (tickets finished, runs
 *   started, spend) and four figures (lead time, rework rate, first-gate pass rate, how
 *   many runs reported cost). Each figure comes straight from the server, which sends null when
 *   there was nothing to compute (no ticket finished, no gate ran); a null is shown as "No data"
 *   with the reason, never as 0. Spend is a chart only if some run reported a cost, and the cost
 *   coverage tile says how complete it is.
 *
 * Exports: StatsGrid.
 * Depends on: components/charts, components/stats, domain/stats-format, @forge/core (type).
 */

import type { ProjectStats, RateStat } from '@forge/core';
import { BarChart } from '#/components/charts/bar-chart.js';
import { StatTile } from '#/components/stats/stat-tile.js';
import {
  formatCount,
  formatDuration,
  formatPercent,
  formatUsd,
} from '#/domain/stats-format.js';

const rateNote = (rate: RateStat, noun: string, none: string): string =>
  rate.total === 0 ? none : `${rate.hits} of ${rate.total} ${noun}`;

export function StatsGrid(props: { stats: ProjectStats }) {
  const { stats } = props;
  const spendReported = stats.cost_coverage.runs_with_cost > 0;
  const spend = stats.spend_per_day.map((p) => ({
    date: p.date,
    value: spendReported ? p.value : null,
  }));

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 rounded-xl border border-line bg-surface p-4 lg:grid-cols-3">
        <BarChart
          title="Tickets done per day"
          points={stats.throughput}
          format={formatCount}
          noData="No data in this range."
        />
        <BarChart
          title="Runs per day"
          points={stats.runs_per_day}
          format={formatCount}
          noData="No data in this range."
        />
        <BarChart
          title="Spend per day"
          points={spend}
          format={formatUsd}
          noData="No run reported a cost in this range."
        />
      </div>

      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Lead time (median)"
          value={
            stats.lead_time.median_ms === null
              ? null
              : formatDuration(stats.lead_time.median_ms)
          }
          note={
            stats.lead_time.count === 0
              ? 'No ticket finished in this range.'
              : `p90 ${formatDuration(stats.lead_time.p90_ms)} · ${stats.lead_time.count} tickets`
          }
        />
        <StatTile
          label="Rework rate"
          value={
            stats.rework_rate.rate === null ? null : formatPercent(stats.rework_rate.rate)
          }
          note={rateNote(
            stats.rework_rate,
            'new tickets sent back',
            'No ticket was created in this range.',
          )}
        />
        <StatTile
          label="G1 pass rate"
          value={
            stats.gate_pass_rate.rate === null
              ? null
              : formatPercent(stats.gate_pass_rate.rate)
          }
          note={rateNote(
            stats.gate_pass_rate,
            'G1 verdicts passed',
            'No G1 verdict in this range.',
          )}
        />
        <StatTile
          label="Cost coverage"
          value={
            stats.cost_coverage.runs_total === 0
              ? null
              : `${stats.cost_coverage.runs_with_cost} of ${stats.cost_coverage.runs_total}`
          }
          note={
            stats.cost_coverage.runs_total === 0
              ? 'No runs in this range.'
              : 'runs reported cost'
          }
        />
      </dl>
    </div>
  );
}
