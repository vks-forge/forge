/**
 * CostPage: where a project's money and tokens went, for the last 7, 30 or 90 days.
 *
 * Why: Workers bill by the token and the owner wants to know which tickets, runs and harnesses
 *   ate the budget. Forge records only what the harness reported, so the page is built not to
 *   overstate: the total is "spend reported", a sentence says how many runs reported cost,
 *   models are shown in tokens (labelled "no price table yet"), and the budgets block lists
 *   the caps that really exist (per run, per step) and says plainly that a per-period budget
 *   is not set. The range switch keeps the previous numbers on screen while the new range
 *   loads. Loading, empty, error and offline each have their own state.
 *
 * Exports: CostPage.
 * Depends on: react, react-router, api/use-stats, components/*, domain/cost-view, state/*.
 */

import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { useParams } from 'react-router';
import { describeError } from '#/api/describe-error.js';
import { useCostReport } from '#/api/use-stats.js';
import { BarChart } from '#/components/charts/bar-chart.js';
import { RankList } from '#/components/stats/rank-list.js';
import { StatTile } from '#/components/stats/stat-tile.js';
import { OfflineNotice } from '#/components/status/offline-notice.js';
import { StatePanel } from '#/components/status/state-panel.js';
import { ToggleGroup } from '#/components/ui/toggle-group.js';
import {
  costSeries,
  coverageNote,
  harnessEntries,
  modelEntries,
  runEntries,
  ticketEntries,
  tokenLine,
} from '#/domain/cost-view.js';
import {
  formatCount,
  formatTokens,
  formatUsd,
  RANGES,
  rangeLabel,
} from '#/domain/stats-format.js';
import { useStatsPrefs } from '#/state/use-stats-prefs.js';

function Section(props: {
  id: string;
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={props.id}
      className="grid content-start gap-2 rounded-xl border border-line bg-surface p-4"
    >
      <h2 id={props.id} className="text-sm font-semibold">
        {props.title}
      </h2>
      {props.note ? <p className="text-xs text-muted">{props.note}</p> : null}
      {props.children}
    </section>
  );
}

export function CostPage() {
  const { slug = '' } = useParams();
  const { range, setRange } = useStatsPrefs();
  const query = useCostReport(slug, range);

  useEffect(() => {
    document.title = 'Cost · Forge';
  }, []);

  if (query.isPending) {
    return <StatePanel kind="loading" label="Loading cost" />;
  }

  if (query.isError) {
    const { title, detail } = describeError(query.error);

    return (
      <StatePanel
        kind="error"
        title={title}
        detail={detail}
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
      />
    );
  }

  const report = query.data;
  const none = report.runs_total === 0;

  return (
    <section className="grid gap-4">
      <header className="grid gap-1">
        <p className="font-data text-xs text-muted">{slug}</p>
        <h1 className="text-2xl font-semibold tracking-tight">Cost</h1>
        <p className="max-w-prose text-sm text-muted">
          What Workers spent on this project, as far as their harnesses reported it.
        </p>
      </header>

      <OfflineNotice>You are offline. These are the last figures loaded.</OfflineNotice>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <ToggleGroup
          label="Range"
          value={range}
          options={RANGES.map((r) => ({ value: r, label: r }))}
          onChange={setRange}
        />
        <p role="status" className="text-xs text-muted">
          {query.isFetching ? 'Updating' : `Showing the ${rangeLabel(report.range)}`}
        </p>
      </div>

      {none ? (
        <StatePanel kind="empty" title="No runs in this range">
          Spend appears here once Workers have run on this project in the{' '}
          {rangeLabel(report.range)}.
        </StatePanel>
      ) : (
        <>
          <dl className="grid gap-3 sm:grid-cols-3">
            <StatTile
              label="Spend reported"
              value={report.runs_with_cost === 0 ? null : formatUsd(report.total_usd)}
              note={coverageNote(report.runs_with_cost, report.runs_total)}
            />
            <StatTile
              label="Runs"
              value={formatCount(report.runs_total)}
              note={`in the ${rangeLabel(report.range)}`}
            />
            <StatTile
              label="Tokens"
              value={formatTokens(report.tokens.in + report.tokens.out)}
              note={tokenLine(report.tokens)}
            />
          </dl>

          <div className="rounded-xl border border-line bg-surface p-4">
            <BarChart
              title="Spend per day (USD)"
              points={costSeries(report.per_day, report.runs_with_cost)}
              format={formatUsd}
              noData="No run reported a cost in this range."
            />
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <Section
              id="cost-tickets"
              title="Top tickets"
              note="Highest reported spend first."
            >
              {report.by_ticket.length === 0 ? (
                <p className="text-sm text-muted">No ticket has a reported cost.</p>
              ) : (
                <RankList label="Top tickets" entries={ticketEntries(slug, report)} />
              )}
            </Section>
            <Section
              id="cost-runs"
              title="Top runs"
              note="Runs without a reported cost come last."
            >
              <RankList label="Top runs" entries={runEntries(slug, report)} />
            </Section>
            <Section id="cost-harness" title="By harness">
              {report.by_harness.length === 0 ? (
                <p className="text-sm text-muted">No harness reported a cost.</p>
              ) : (
                <RankList label="By harness" entries={harnessEntries(report)} />
              )}
            </Section>
            <Section
              id="cost-models"
              title="By model (tokens)"
              note="Tokens; no price table yet, so no dollars per model."
            >
              {report.by_model.length === 0 ? (
                <p className="text-sm text-muted">No model usage was reported.</p>
              ) : (
                <RankList label="By model" entries={modelEntries(report)} />
              )}
            </Section>
          </div>

          <Section id="cost-budgets" title="Budgets">
            <dl className="grid gap-2 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-muted">Per-run cap</dt>
                <dd className="font-data">{formatUsd(report.budgets.run_max_usd)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Per-step budget</dt>
                <dd className="font-data">{formatUsd(report.budgets.step_budget_usd)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Period budget</dt>
                <dd className="font-data">Not set</dd>
              </div>
            </dl>
          </Section>
        </>
      )}
    </section>
  );
}
