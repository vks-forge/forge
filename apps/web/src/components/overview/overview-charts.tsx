/**
 * OverviewCharts: spend, tickets and runs over time, spend breakdowns, and how complete the cost is.
 *
 * Why: the KPI strip says how much; these say when and where. Spend is stacked by project so
 *   one runaway project is visible against the rest, tickets show what got done against what
 *   was started, runs split into passed, failed and interrupted so a bad week shows its colour.
 *   Three rings break the same spend down by project, harness and lane. Spend only ever
 *   includes runs that reported a cost, and the line under the charts says how many did ("N of
 *   M runs reported a cost"): the rest are counted, never estimated, so no chart can be read as
 *   complete when it is not. On a project's Home (`scoped`) spend over time is one series, not
 *   stacked, and the by-project ring is left out.
 *
 * Exports: OverviewCharts.
 * Depends on: @forge/core (OverviewStats type), components/charts/*, domain/overview-view,
 *   domain/stats-format.
 */

import type { OverviewStats } from '@forge/core';
import { BucketChart } from '#/components/charts/bucket-chart.js';
import { DonutChart } from '#/components/charts/donut-chart.js';
import {
  coverageSentence,
  donutSlices,
  stackedSpend,
  totalSpend,
} from '#/domain/overview-view.js';
import { formatCount, formatUsd } from '#/domain/stats-format.js';

const CARD = 'rounded-xl border border-line bg-surface p-4';

export function OverviewCharts(props: { stats: OverviewStats; scoped?: boolean }) {
  const { stats, scoped = false } = props;
  const { buckets, group } = stats;
  const noSpend =
    stats.cost_coverage.runs_with_cost === 0
      ? 'No run reported a cost in this range.'
      : 'No spend in this range.';

  return (
    <section aria-labelledby="overview-charts" className="grid grid-cols-1 gap-4">
      <h2 id="overview-charts" className="text-base font-semibold">
        Spend and activity
      </h2>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className={`${CARD} lg:col-span-2`}>
          <BucketChart
            title={scoped ? 'Spend over time' : 'Spend over time, by project'}
            buckets={buckets}
            group={group}
            series={
              scoped
                ? totalSpend(stats.spend_by_project)
                : stackedSpend(stats.spend_by_project, stats.spend_by_project_total)
            }
            mode="stacked"
            format={formatUsd}
            noData={noSpend}
          />
        </div>
        <div className={CARD}>
          <BucketChart
            title="Tickets done and started"
            buckets={buckets}
            group={group}
            mode="grouped"
            format={formatCount}
            noData="No tickets done or started in this range."
            series={[
              {
                key: 'done',
                label: 'Done',
                color: 'var(--series-3)',
                values: stats.tickets_done,
              },
              {
                key: 'started',
                label: 'Started',
                color: 'var(--series-1)',
                values: stats.tickets_started,
              },
            ]}
          />
        </div>
        <div className={CARD}>
          <BucketChart
            title="Runs by outcome"
            buckets={buckets}
            group={group}
            mode="stacked"
            format={formatCount}
            noData="No finished runs in this range."
            series={[
              {
                key: 'passed',
                label: 'Passed',
                color: 'var(--good)',
                values: stats.runs_passed,
              },
              {
                key: 'failed',
                label: 'Failed',
                color: 'var(--danger)',
                values: stats.runs_failed,
              },
              {
                key: 'interrupted',
                label: 'Interrupted',
                color: 'var(--faint)',
                values: stats.runs_interrupted,
              },
            ]}
          />
        </div>
      </div>

      <div
        className={`${CARD} grid grid-cols-1 gap-6 lg:grid-cols-2 ${scoped ? '' : 'xl:grid-cols-3'}`}
      >
        {scoped ? null : (
          <DonutChart
            title="Spend by project"
            slices={donutSlices(stats.spend_by_project_total, 'Other projects')}
            format={formatUsd}
            noData={noSpend}
          />
        )}
        <DonutChart
          title="Spend by harness"
          slices={donutSlices(stats.spend_by_harness)}
          format={formatUsd}
          noData={noSpend}
        />
        <DonutChart
          title="Spend by lane"
          slices={donutSlices(stats.spend_by_lane)}
          format={formatUsd}
          noData={noSpend}
        />
      </div>

      <p className="text-sm text-muted">
        <span className="font-medium text-fg">
          {coverageSentence(stats.cost_coverage)}
        </span>
        {stats.cost_coverage.runs_total > stats.cost_coverage.runs_with_cost
          ? '. Runs without a cost are counted but never estimated, so spend is a floor.'
          : '. Runs without a cost are counted but never estimated.'}
      </p>
    </section>
  );
}
