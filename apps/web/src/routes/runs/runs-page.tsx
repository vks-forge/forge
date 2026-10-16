/**
 * RunsPage: every Worker run of a project, working, parked or finished.
 *
 * Why: when a ticket is slow or the bill is high the owner needs to see the runs behind it:
 *   which are live, which are parked until a quota resets, which failed and why. The list
 *   filters to a group (Active, Done, Problems) on the server, loads 50 at a time, and keeps
 *   itself fresh every few seconds while any run is live, then stops so an idle tab costs
 *   nothing. Opening a run shows its detail in a drawer held in the URL (`?run=<id>`), so a
 *   link from the Inbox or a reload returns to it. Loading, empty, error and offline each
 *   have their own state.
 *
 * Exports: RunsPage.
 * Depends on: react, react-router, api/*, components/*, routes/runs/*, state/*.
 */

import { useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { describeError } from '#/api/describe-error.js';
import { RUNS_LIVE_MS, useRunList } from '#/api/use-runs.js';
import { OfflineNotice } from '#/components/status/offline-notice.js';
import { StatePanel } from '#/components/status/state-panel.js';
import { Button } from '#/components/ui/button.js';
import { ToggleGroup } from '#/components/ui/toggle-group.js';
import { WindowedList } from '#/components/ui/windowed-list.js';
import { isLive, RUN_FILTERS } from '#/domain/run-format.js';
import { RunDrawer } from '#/routes/runs/run-drawer.js';
import { RUN_ROW_HEIGHT, RunRow } from '#/routes/runs/run-row.js';
import { useRunsPrefs } from '#/state/use-runs-prefs.js';

const EMPTY_HINT = {
  all: 'When a Worker starts on a ticket, its run appears here.',
  active: 'No Worker is running right now.',
  done: 'Finished runs appear here.',
  problems: 'No run has failed, timed out or been interrupted.',
} as const;

export function RunsPage() {
  const { slug = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const { filter, setFilter } = useRunsPrefs();
  const list = useRunList(slug, filter);
  const runId = params.get('run');

  useEffect(() => {
    document.title = 'Runs · Forge';
  }, []);

  const openRun = (id: string | null): void =>
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      if (id) {
        next.set('run', id);
      } else {
        next.delete('run');
      }

      return next;
    });

  if (list.isPending) {
    return <StatePanel kind="loading" label="Loading runs" />;
  }

  if (list.isError && !list.data) {
    const { title, detail } = describeError(list.error);

    return (
      <StatePanel
        kind="error"
        title={title}
        detail={detail}
        onRetry={() => void list.refetch()}
        retrying={list.isFetching}
      />
    );
  }

  const runs = (list.data?.pages ?? []).flatMap((page) => page.items);
  const live = runs.filter(isLive).length;

  return (
    <section className="grid gap-4">
      <header className="grid gap-1">
        <p className="font-data text-xs text-muted">{slug}</p>
        <h1 className="text-2xl font-semibold tracking-tight">Runs</h1>
        <p className="max-w-prose text-sm text-muted">
          Every Worker run on this project, newest first. A run parked for quota says so
          and resumes by itself.
        </p>
      </header>

      <OfflineNotice>
        You are offline. This list is the last one loaded and will not refresh.
      </OfflineNotice>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <ToggleGroup
          label="Show runs"
          value={filter}
          options={RUN_FILTERS.map((f) => ({ value: f.key, label: f.label }))}
          onChange={setFilter}
        />
        <p role="status" className="text-xs text-muted">
          {live > 0
            ? `${live} running, refreshing every ${RUNS_LIVE_MS / 1000} s`
            : 'No run is live, not refreshing'}
        </p>
      </div>

      {runs.length === 0 ? (
        <StatePanel kind="empty" title="No runs here">
          {EMPTY_HINT[filter]}
        </StatePanel>
      ) : (
        <WindowedList
          items={runs}
          rowHeight={RUN_ROW_HEIGHT}
          label="Runs"
          keyOf={(run) => run.id}
          renderRow={(run) => <RunRow run={run} onOpen={openRun} />}
        />
      )}

      {list.hasNextPage ? (
        <div className="flex items-center gap-3">
          <Button
            onClick={() => void list.fetchNextPage()}
            status={list.isFetchingNextPage ? 'loading' : 'idle'}
          >
            Load more
          </Button>
          <span className="text-xs text-muted">Showing {runs.length}</span>
        </div>
      ) : null}

      {list.isFetchNextPageError ? (
        <p role="alert" className="text-sm text-danger">
          Could not load more. Check that Forge is running and try again.
        </p>
      ) : null}

      <RunDrawer slug={slug} id={runId} onClose={() => openRun(null)} />
    </section>
  );
}
