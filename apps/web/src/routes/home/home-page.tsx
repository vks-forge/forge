/**
 * HomePage: one project's state at a glance.
 *
 * Why: there is no company-wide Home (d-0104); the owner works inside one project. Home
 *   answers three questions in order: what waits on me (inbox items that need action), what is
 *   moving (tickets with a stage track), and how is it going (the Overview's figures and
 *   charts, scoped to this project: key figures, spend and activity over time, spend by
 *   harness and lane, and how many runs reported a cost). Range and grouping sit behind the same
 *   Filter button as the Overview, beside the update status, and live in the URL; the
 *   project is fixed, so there is no project picker. Figures refetch every 30 seconds and keep
 *   the old numbers while a new filter loads. A New card button in the header starts work, the
 *   same popup as the Board's. Waiting on you and In progress have their own loading and error
 *   states, so a failing figures call never hides the inbox or the tickets. Figures the server
 *   cannot compute are "No data", never 0.
 *
 * Exports: HomePage.
 * Depends on: react, react-router, api/{use-overview,describe-error}, components/{cards,overview,
 *   status}, domain/overview-params, routes/home/*.
 */

import { useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { describeError } from '#/api/describe-error.js';
import { useOverview } from '#/api/use-overview.js';
import { NewCardButton } from '#/components/cards/new-card-button.js';
import { OverviewCharts } from '#/components/overview/overview-charts.js';
import { OverviewControls } from '#/components/overview/overview-controls.js';
import { OverviewKpis } from '#/components/overview/overview-kpis.js';
import { OfflineNotice } from '#/components/status/offline-notice.js';
import { StatePanel } from '#/components/status/state-panel.js';
import { nextSearch, parseOverviewFilters, requestOf } from '#/domain/overview-params.js';
import { InProgress } from '#/routes/home/in-progress.js';
import { WaitingOnYou } from '#/routes/home/waiting-on-you.js';
import type { OverviewChange } from '#/types/overview.types.js';
import { ChartNoAxesColumn } from 'lucide-react';

/** Home's filters are range and grouping only; a hand-edited project or archived parameter is dropped. */
function homeSearch(search: URLSearchParams): URLSearchParams {
  const clean = new URLSearchParams(search);
  clean.delete('projects');
  clean.delete('archived');

  return clean;
}

export function HomePage() {
  const { slug = '' } = useParams();
  const [search, setSearch] = useSearchParams();
  const filters = parseOverviewFilters(homeSearch(search));
  // Archived is always on: a project that was archived still has history worth reading.
  const stats = useOverview({ ...requestOf(filters), projects: [slug], archived: true });
  const change = (next: OverviewChange): void =>
    setSearch(nextSearch(homeSearch(search), next));

  useEffect(() => {
    document.title = 'Home · Forge';
  }, []);

  return (
    <section className="grid grid-cols-1 gap-6">
      <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="grid min-w-0 gap-1">
          <p className="font-data text-xs text-muted">{slug}</p>
          <h1 className="text-2xl font-semibold tracking-tight">Home</h1>
        </div>
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-x-3 gap-y-2">
          <div
            role="group"
            aria-label="Data status and filters"
            className="flex min-w-0 max-w-full flex-wrap items-center gap-x-3 gap-y-2"
          >
            <p role="status" className="text-xs text-muted">
              {stats.isFetching
                ? 'Updating'
                : stats.dataUpdatedAt > 0
                  ? `Updated ${new Date(stats.dataUpdatedAt).toLocaleTimeString()}`
                  : ''}
            </p>
            <OverviewControls
              scoped
              filters={filters}
              onChange={change}
              onReset={() => setSearch(new URLSearchParams())}
            />
          </div>
          <NewCardButton slug={slug} variant="primary" />
        </div>
      </header>

      <OfflineNotice>You are offline. These are the last figures loaded.</OfflineNotice>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <WaitingOnYou slug={slug} />
        <InProgress slug={slug} />
      </div>

      {stats.isPending ? (
        <StatePanel kind="loading" label="Loading project figures" />
      ) : !stats.data ? (
        <StatePanel
          kind="error"
          title={describeError(stats.error).title}
          detail={describeError(stats.error).detail}
          onRetry={() => void stats.refetch()}
          retrying={stats.isFetching}
        />
      ) : stats.data.projects_included.length === 0 ? (
        <StatePanel
          kind="empty"
          icon={ChartNoAxesColumn}
          title="No figures for this project"
        >
          Forge has no record of a project called {slug}.
        </StatePanel>
      ) : (
        <>
          <OverviewKpis stats={stats.data} scoped />
          <OverviewCharts stats={stats.data} scoped />
        </>
      )}

      {stats.isError && stats.data ? (
        <p role="alert" className="text-sm text-danger">
          Could not refresh: {describeError(stats.error).title}. Showing the last figures
          loaded.
        </p>
      ) : null}
    </section>
  );
}
