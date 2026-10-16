/**
 * OverviewPage: `/`, how all of Forge's work is going across projects.
 *
 * Why: an owner running several projects had no single place to see what waits on them, how
 *   the work is going and what it costs; `/` used to jump into the last project (d-0159,
 *   d-0162). It now shows this dashboard. Range, grouping, project filter and the archived
 *   switch live in the URL, so a view can be shared and Back steps through filters; figures
 *   refetch every 30 seconds and keep the old numbers on screen while a new filter loads.
 *   A fresh install has nothing to summarise, so first it follows the setup answer: an
 *   unfinished setup goes to the wizard (unless the person chose "Finish later"), and with no
 *   project at all the page says so and offers the two ways forward. If Forge's system answer
 *   cannot be read, the project list decides alone: a missing answer must never lock a
 *   working install out of its dashboard.
 *
 * Exports: OverviewPage.
 * Depends on: react, react-router, api/{use-overview,use-projects,use-onboarding,describe-error},
 *   components/status/*, components/ui/button, routes/overview/*, domain/overview-params,
 *   state/use-welcome-prefs.
 */

import { useEffect } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router';
import { describeError } from '#/api/describe-error.js';
import { useSystem } from '#/api/use-onboarding.js';
import { useOverview } from '#/api/use-overview.js';
import { useAllProjects } from '#/api/use-projects.js';
import { OfflineNotice } from '#/components/status/offline-notice.js';
import { StatePanel } from '#/components/status/state-panel.js';
import { Button } from '#/components/ui/button.js';
import { nextSearch, parseOverviewFilters, requestOf } from '#/domain/overview-params.js';
import { OverviewAttention } from '#/routes/overview/overview-attention.js';
import { OverviewCharts } from '#/routes/overview/overview-charts.js';
import { OverviewControls } from '#/routes/overview/overview-controls.js';
import { OverviewKpis } from '#/routes/overview/overview-kpis.js';
import { OverviewProjects } from '#/routes/overview/overview-projects.js';
import { useWelcomePrefs } from '#/state/use-welcome-prefs.js';
import type { OverviewChange } from '#/types/overview.types.js';

function Dashboard() {
  const [search, setSearch] = useSearchParams();
  const projects = useAllProjects();
  const filters = parseOverviewFilters(search);
  const stats = useOverview(requestOf(filters));
  const change = (next: OverviewChange): void => setSearch(nextSearch(search, next));

  useEffect(() => {
    document.title = 'Overview · Forge';
  }, []);

  return (
    <section className="grid grid-cols-1 gap-6">
      <header className="grid grid-cols-1 gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
          <p role="status" className="text-xs text-muted">
            {stats.isFetching
              ? 'Updating'
              : stats.dataUpdatedAt > 0
                ? `Updated ${new Date(stats.dataUpdatedAt).toLocaleTimeString()}`
                : ''}
          </p>
        </div>
        <OverviewControls filters={filters} projects={projects.data} onChange={change} />
      </header>

      <OfflineNotice>You are offline. These are the last figures loaded.</OfflineNotice>

      {stats.isPending ? (
        <StatePanel kind="loading" label="Loading the overview" />
      ) : !stats.data ? (
        <StatePanel
          kind="error"
          title={describeError(stats.error).title}
          detail={describeError(stats.error).detail}
          onRetry={() => void stats.refetch()}
          retrying={stats.isFetching}
        />
      ) : stats.data.projects.length === 0 ? (
        <StatePanel kind="empty" title="No projects match these filters">
          <p>
            {filters.projects.length > 0
              ? 'None of the chosen projects is in this view.'
              : 'Every project is archived. Include archived projects to see them.'}
          </p>
          {filters.projects.length > 0 ? (
            <Button className="mt-3" onClick={() => change({ projects: [] })}>
              Show all projects
            </Button>
          ) : null}
        </StatePanel>
      ) : (
        <>
          {stats.data.unknown.length > 0 ? (
            <p role="status" className="rounded-lg bg-attn-soft px-3 py-2 text-sm">
              Ignored unknown projects: {stats.data.unknown.join(', ')}.
            </p>
          ) : null}
          <OverviewKpis stats={stats.data} />
          <OverviewAttention stats={stats.data} />
          <OverviewCharts stats={stats.data} />
          <OverviewProjects stats={stats.data} />
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

export function OverviewPage() {
  const projects = useAllProjects();
  const system = useSystem();
  const welcome = useWelcomePrefs();

  if (projects.isPending || system.isPending) {
    return <StatePanel kind="loading" label="Loading the overview" />;
  }

  if (projects.isError) {
    const { title, detail } = describeError(projects.error);

    return (
      <StatePanel
        kind="error"
        title={title}
        detail={detail}
        onRetry={() => void projects.refetch()}
        retrying={projects.isFetching}
      />
    );
  }

  if (system.data && !system.data.first_run.complete && !welcome.dismissed) {
    return <Navigate to="/welcome" replace />;
  }

  if (projects.data.length === 0) {
    return (
      <StatePanel kind="empty" title="No projects yet">
        <p>
          Add a repository from this machine to start, or finish setting Forge up first.
        </p>
        <p className="mt-3 flex flex-wrap gap-4">
          <Link className="font-medium text-signal underline" to="/projects/new">
            Add project
          </Link>
          <Link
            className="font-medium text-signal underline"
            to="/welcome"
            onClick={welcome.reopen}
          >
            Resume setup
          </Link>
        </p>
      </StatePanel>
    );
  }

  return <Dashboard />;
}
