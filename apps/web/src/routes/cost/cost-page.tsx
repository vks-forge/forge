/**
 * CostPage: where a project's money and tokens went, for the last 7, 30 or 90 days.
 *
 * Why: Workers bill by the token and the owner wants to know which tickets, runs and harnesses
 *   ate the budget. Forge records only what the harness reported, so the page is built not to
 *   overstate: the total is "spend reported", a sentence says how many runs reported cost,
 *   models are shown in tokens (labelled "no price table yet"), and the budgets block lists
 *   the caps that really exist (per run, per step) and says plainly that a per-period budget
 *   is not set. The headline is the total first, then the same two sources every screen
 *   shows, Workers then the Director (planning and answering, with a "what's this" gloss);
 *   spend per day stacks the two with a written legend, and the note under it says Director
 *   spend before 20 Oct is dated by card. The range switch keeps the previous numbers on screen while the new range
 *   loads. Loading, empty, error and offline each have their own state.
 *
 * Exports: CostPage.
 * Depends on: react, react-router, api/use-stats, components/*, domain/cost-view, state/*.
 *   Top tickets and Top runs are server-paged (components/stats/paged-rank-list).
 */

import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { useParams } from 'react-router';
import { describeError } from '#/api/describe-error.js';
import { useCostReport } from '#/api/use-stats.js';
import { BarChart } from '#/components/charts/bar-chart.js';
import { PagedRankList } from '#/components/stats/paged-rank-list.js';
import { RankList } from '#/components/stats/rank-list.js';
import { StatTile } from '#/components/stats/stat-tile.js';
import { WhatsThis } from '#/components/ui/whats-this.js';
import { OfflineNotice } from '#/components/status/offline-notice.js';
import { StatePanel } from '#/components/status/state-panel.js';
import { EmptyState } from '#/components/ui/empty-state.js';
import { ToggleGroup } from '#/components/ui/toggle-group.js';
import { splitLine } from '#/domain/cost-display.js';
import {
  costParts,
  coverageNote,
  DIRECTOR_DATING_NOTE,
  harnessEntries,
  hasRecordedCost,
  modelEntries,
  runEntries,
  splitSeries,
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
import { useCostPaging } from '#/state/use-cost-paging.js';
import { useStatsPrefs } from '#/state/use-stats-prefs.js';
import { Coins } from 'lucide-react';

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
  const { paging, setOffset, setLimit } = useCostPaging(range);
  const query = useCostReport(slug, range, paging);

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
  const none = report.runs_total === 0 && report.director_steps_total === 0;
  const recorded = hasRecordedCost(report);

  return (
    <section className="grid gap-4">
      <header className="grid gap-1">
        <p className="font-data text-xs text-muted">{slug}</p>
        <h1 className="text-2xl font-semibold tracking-tight">Cost</h1>
        <p className="max-w-prose text-sm text-muted">
          What this project cost: the Workers that write the code and the Director that
          plans and answers, as far as each reported it.
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
        <StatePanel kind="empty" icon={Coins} title="No runs in this range">
          Spend appears here once Workers or the Director have worked on this project in
          the {rangeLabel(report.range)}.
        </StatePanel>
      ) : (
        <>
          <dl className="grid gap-3 sm:grid-cols-3">
            <StatTile
              label="Total spend"
              help={<WhatsThis term="director" />}
              value={recorded ? formatUsd(report.total_usd) : null}
              note={
                recorded
                  ? `${splitLine(report.worker_usd, report.director_usd)}. ${coverageNote(
                      report.runs_with_cost,
                      report.runs_total,
                      {
                        recorded: report.director_steps_recorded,
                        total: report.director_steps_total,
                      },
                    )}`
                  : coverageNote(report.runs_with_cost, report.runs_total, {
                      recorded: report.director_steps_recorded,
                      total: report.director_steps_total,
                    })
              }
            />
            <StatTile
              label="Runs"
              value={formatCount(report.runs_total)}
              note={`in the ${rangeLabel(report.range)}`}
            />
            <StatTile
              label="Tokens"
              help={<WhatsThis term="cache" />}
              value={formatTokens(report.tokens.in + report.tokens.out)}
              note={tokenLine(report.tokens)}
            />
          </dl>

          <div className="rounded-xl border border-line bg-surface p-4">
            <BarChart
              title="Spend per day (USD)"
              points={splitSeries(report.per_day_split, recorded)}
              parts={costParts}
              format={formatUsd}
              noData="Nothing reported a cost in this range."
            />
            <p className="mt-2 text-xs text-muted">{DIRECTOR_DATING_NOTE}</p>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <Section
              id="cost-tickets"
              title="Top tickets"
              note="Highest reported spend first."
            >
              {report.by_ticket.length === 0 && paging.ticket.offset === 0 ? (
                <EmptyState
                  variant="compact"
                  icon={Coins}
                  title="No ticket has a reported cost."
                />
              ) : (
                <PagedRankList
                  label="Top tickets"
                  entries={ticketEntries(slug, report)}
                  offset={paging.ticket.offset}
                  limit={paging.ticket.limit}
                  total={
                    report.by_ticket_total ??
                    paging.ticket.offset + report.by_ticket.length
                  }
                  busy={query.isFetching}
                  onOffset={(offset) => setOffset('ticket', offset)}
                  onLimit={(limit) => setLimit('ticket', limit)}
                />
              )}
            </Section>
            <Section
              id="cost-runs"
              title="Top runs"
              note="Runs without a reported cost come last."
            >
              <PagedRankList
                label="Top runs"
                entries={runEntries(slug, report)}
                offset={paging.run.offset}
                limit={paging.run.limit}
                total={report.by_run_total ?? paging.run.offset + report.by_run.length}
                busy={query.isFetching}
                onOffset={(offset) => setOffset('run', offset)}
                onLimit={(limit) => setLimit('run', limit)}
              />
            </Section>
            <Section id="cost-harness" title="By harness">
              {report.by_harness.length === 0 ? (
                <EmptyState
                  variant="compact"
                  icon={Coins}
                  title="No harness reported a cost."
                />
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
                <EmptyState
                  variant="compact"
                  icon={Coins}
                  title="No model usage was reported."
                />
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
