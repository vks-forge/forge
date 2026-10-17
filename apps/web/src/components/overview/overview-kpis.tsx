/**
 * OverviewKpis: the strip of headline figures across every project in the view (or one project's).
 *
 * Why: before any chart the owner wants eight answers: what did it cost (and against the
 *   period before), what this month, how much got done, what is moving, what waits on me, how
 *   many Workers run right now, how many projects are alive, and whether first-gate checks
 *   pass. A figure that cannot be known is "No data" with the reason, never 0: spend with no
 *   run that reported a cost reads "No data", not a free week. "Waiting on you" is the one
 *   tile in amber, because it is the only figure that asks something of the person. On a
 *   project's Home (`scoped`) "Active projects" is dropped, since there is only one.
 *
 * Exports: OverviewKpis.
 * Depends on: @forge/core (OverviewStats type), components/stats/stat-tile,
 *   domain/stats-format, domain/overview-view.
 */

import type { OverviewStats } from '@forge/core';
import { StatTile } from '#/components/stats/stat-tile.js';
import { spendChange } from '#/domain/overview-view.js';
import {
  formatCount,
  formatPercent,
  formatUsd,
  rangeLabel,
} from '#/domain/stats-format.js';

export function OverviewKpis(props: { stats: OverviewStats; scoped?: boolean }) {
  const { kpis, cost_coverage: coverage } = props.stats;
  const reported = coverage.runs_with_cost > 0;
  const change = reported
    ? spendChange(kpis.spend_usd, kpis.spend_prev_usd, props.stats.range === 'today')
    : null;

  const g1 = kpis.g1_pass_rate;

  return (
    <section aria-label="Key figures">
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile
          label="Spend"
          value={reported ? formatUsd(kpis.spend_usd) : null}
          note={
            reported
              ? `${rangeLabel(props.stats.range)}${change ? `. ${change}` : ''}`
              : coverage.runs_total === 0
                ? 'No runs in this range.'
                : 'No run reported a cost.'
          }
        />
        <StatTile
          label="Spend this month"
          value={formatUsd(kpis.spend_this_month_usd)}
          note="Calendar month so far, UTC."
        />
        <StatTile
          label="Tickets done"
          value={formatCount(kpis.tickets_done)}
          note={rangeLabel(props.stats.range)}
        />
        <StatTile
          label="In progress"
          value={formatCount(kpis.tickets_in_progress)}
          note="Tickets moving now."
        />
        <StatTile
          label="Waiting on you"
          value={formatCount(kpis.waiting_on_you)}
          note={
            kpis.waiting_on_you === 0 ? 'Nothing needs a decision.' : 'Need a decision.'
          }
          attention={kpis.waiting_on_you > 0}
        />
        <StatTile
          label="Workers running"
          value={formatCount(kpis.workers_running)}
          note="Right now."
        />
        {props.scoped ? null : (
          <StatTile
            label="Active projects"
            value={formatCount(kpis.active_projects)}
            note={`Of ${props.stats.projects_included.length} in this view.`}
          />
        )}
        <StatTile
          label="G1 pass rate"
          value={g1.rate === null ? null : formatPercent(g1.rate)}
          note={
            g1.total === 0
              ? 'No G1 verdict in this range.'
              : `${g1.hits} of ${g1.total} verdicts passed`
          }
        />
      </dl>
    </section>
  );
}
