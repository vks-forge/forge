/**
 * HomePage: one project's state at a glance.
 *
 * Why: there is no company-wide Home (d-0104); the owner works inside one project. Home
 *   answers three questions in order: what waits on me (inbox items that need action), what is
 *   moving (tickets with a stage track), and how is it going (daily graphs plus lead time,
 *   rework, gate pass and cost coverage over a 7, 30 or 90 day range). A readout line above
 *   gives the numbers right now. A New card button in the header starts work, the same popup as
 *   the Board's. Every block has its own loading and error state, and a failing stats call never
 *   hides the inbox or the tickets. Figures the server cannot compute are "No data", never 0.
 *
 * Exports: HomePage.
 * Depends on: react, react-router, api/*, components/*, routes/home/*.
 */

import { useEffect } from 'react';
import { useParams } from 'react-router';
import { describeError } from '#/api/describe-error.js';
import { useStats } from '#/api/use-stats.js';
import { NewCardButton } from '#/components/cards/new-card-button.js';
import { OfflineNotice } from '#/components/status/offline-notice.js';
import { StatePanel } from '#/components/status/state-panel.js';
import { ToggleGroup } from '#/components/ui/toggle-group.js';
import { RANGES, rangeLabel } from '#/domain/stats-format.js';
import { InProgress } from '#/routes/home/in-progress.js';
import { ReadoutLine } from '#/routes/home/readout-line.js';
import { StatsGrid } from '#/routes/home/stats-grid.js';
import { WaitingOnYou } from '#/routes/home/waiting-on-you.js';
import { useStatsPrefs } from '#/state/use-stats-prefs.js';

export function HomePage() {
  const { slug = '' } = useParams();
  const { range, setRange } = useStatsPrefs();
  const stats = useStats(slug, range);

  useEffect(() => {
    document.title = 'Home · Forge';
  }, []);

  return (
    <section className="grid gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <p className="font-data text-xs text-muted">{slug}</p>
          <h1 className="text-2xl font-semibold tracking-tight">Home</h1>
        </div>
        <NewCardButton slug={slug} variant="primary" />
      </header>

      <OfflineNotice>You are offline. These are the last figures loaded.</OfflineNotice>

      {stats.isPending ? (
        <StatePanel kind="loading" label="Loading project figures" />
      ) : stats.isError ? (
        <StatePanel
          kind="error"
          title={describeError(stats.error).title}
          detail={describeError(stats.error).detail}
          onRetry={() => void stats.refetch()}
          retrying={stats.isFetching}
        />
      ) : (
        <ReadoutLine stats={stats.data} />
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <WaitingOnYou slug={slug} />
        <InProgress slug={slug} />
      </div>

      <section aria-labelledby="home-trend" className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="home-trend" className="text-base font-semibold">
            How it is going
          </h2>
          <ToggleGroup
            label="Range"
            value={range}
            options={RANGES.map((r) => ({ value: r, label: r }))}
            onChange={setRange}
          />
        </div>
        <p role="status" className="text-xs text-muted">
          {stats.isFetching ? 'Updating' : `Showing the ${rangeLabel(range)}`}
        </p>
        {stats.data ? <StatsGrid stats={stats.data} /> : null}
      </section>
    </section>
  );
}
