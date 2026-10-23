/**
 * HistoryView: the body of the History tab, shared by the Ticket and Card pages.
 *
 * Why: "what did this go through, and why?" is one question on both pages, so both draw the same
 *   list: entries grouped by day, the newest at the bottom (the story reads top to bottom) or
 *   at the top on request, two filters for the owner who only wants state changes or only what
 *   needed them, and "Load earlier" for a long past. Loading, empty and could-not-load are
 *   each said in words with a retry, and a failed refresh keeps the old list on screen with
 *   one slim line, so a flaky connection never blanks the story. The page passes the query and
 *   where links should land; the project stream refreshes the query, so this component holds
 *   only view state (order, filters).
 *
 * Exports: HistoryView.
 * Depends on: react, @tanstack/react-query (type), lucide-react, @forge/core (type),
 *   api/describe-error, components/history/history-row, components/status/state-panel,
 *   components/ui/button, components/ui/empty-state, domain/history-view, state/use-now,
 *   types/history-view.types.
 */

import type { HistoryEntry } from '@forge/core';
import type { UseInfiniteQueryResult } from '@tanstack/react-query';
import { History } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { describeError } from '#/api/describe-error.js';
import { HistoryRow } from '#/components/history/history-row.js';
import { StatePanel } from '#/components/status/state-panel.js';
import { Button } from '#/components/ui/button.js';
import { EmptyState } from '#/components/ui/empty-state.js';
import {
  HISTORY_FILTERS,
  entryLink,
  groupByDay,
  matchesFilters,
} from '#/domain/history-view.js';
import { useNow } from '#/state/use-now.js';
import type { HistoryFilters, HistoryOrder } from '#/types/history-view.types.js';

const NO_FILTERS: HistoryFilters = { statusOnly: false, needsYouOnly: false };

const PILL =
  'min-h-11 rounded-lg px-3 text-sm font-medium transition-[background-color,color,transform] duration-150 active:translate-y-px sm:min-h-9';

function LoadEarlier(props: { query: UseInfiniteQueryResult<HistoryEntry[]> }) {
  const { query } = props;

  if (!query.hasNextPage) {
    return null;
  }

  return (
    <div className="grid justify-items-start gap-2">
      {query.isFetchNextPageError ? (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-1.5 text-sm">
          Could not load earlier entries. {describeError(query.error).detail}
        </p>
      ) : null}
      <Button
        onClick={() => void query.fetchNextPage()}
        status={query.isFetchingNextPage ? 'loading' : 'idle'}
      >
        Load earlier
      </Button>
    </div>
  );
}

export function HistoryView(props: {
  query: UseInfiniteQueryResult<HistoryEntry[]>;
  scope: { kind: 'ticket' | 'card'; id: string; slug: string };
  /** What the empty state says: whose story this is and when it starts. */
  emptyHint: string;
}) {
  const { query, scope } = props;
  const now = useNow();
  const [order, setOrder] = useState<HistoryOrder>('oldest-first');
  const [filters, setFilters] = useState<HistoryFilters>(NO_FILTERS);
  const end = useRef<HTMLDivElement>(null);
  const loaded = query.data !== undefined;

  // The story reads top to bottom, so open it at the newest entry; once, not on every refresh.
  useEffect(() => {
    if (loaded && order === 'oldest-first') {
      end.current?.scrollIntoView?.({ block: 'end' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the first page lands
  }, [loaded]);

  if (query.isPending) {
    return <StatePanel kind="loading" label="Loading history" />;
  }

  if (query.isError && !query.data) {
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

  const all = query.data ?? [];
  if (all.length === 0) {
    return (
      <EmptyState icon={History} title="Nothing has happened yet">
        {props.emptyHint}
      </EmptyState>
    );
  }

  const shown = all.filter((entry) => matchesFilters(entry, filters));
  const groups = groupByDay(shown, order, now);
  const filtering = filters.statusOnly || filters.needsYouOnly;
  const earlier = <LoadEarlier query={query} />;

  return (
    <section aria-label="History" className="mx-auto grid max-w-3xl gap-4">
      <h2 className="sr-only">History</h2>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="group" aria-label="Filter history" className="flex flex-wrap gap-1">
          {HISTORY_FILTERS.map((filter) => {
            const on = filters[filter.key];

            return (
              <button
                key={filter.key}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  setFilters((current) => ({ ...current, [filter.key]: !on }))
                }
                className={`${PILL} ${on ? 'bg-signal text-on-signal' : 'bg-hover text-muted hover:text-fg'}`}
              >
                {filter.label}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          aria-pressed={order === 'newest-first'}
          onClick={() =>
            setOrder((current) =>
              current === 'oldest-first' ? 'newest-first' : 'oldest-first',
            )
          }
          className={`${PILL} ${order === 'newest-first' ? 'bg-signal text-on-signal' : 'bg-hover text-muted hover:text-fg'}`}
        >
          Newest first
        </button>
      </div>

      {query.isRefetchError ? (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-1.5 text-sm">
          Could not refresh this history. {describeError(query.error).detail}
        </p>
      ) : null}

      {order === 'oldest-first' ? earlier : null}

      {groups.length === 0 ? (
        <EmptyState
          variant="compact"
          icon={History}
          title={
            query.hasNextPage
              ? 'Nothing matches in what is loaded'
              : 'Nothing matches these filters'
          }
          actions={
            filtering ? (
              <Button onClick={() => setFilters(NO_FILTERS)}>Clear filters</Button>
            ) : undefined
          }
        >
          {query.hasNextPage
            ? 'Load earlier entries to look further back.'
            : 'Clear a filter to see the rest.'}
        </EmptyState>
      ) : (
        groups.map((group) => (
          <section key={group.key} aria-label={group.label} className="grid gap-3">
            <h3 className="text-sm font-semibold text-muted">{group.label}</h3>
            <ol className="grid gap-0">
              {group.entries.map((entry, index) => (
                <HistoryRow
                  key={`${entry.at}-${entry.kind}-${entry.title}`}
                  entry={entry}
                  now={now}
                  link={entryLink(scope, entry)}
                  last={index === group.entries.length - 1}
                />
              ))}
            </ol>
          </section>
        ))
      )}

      {order === 'newest-first' ? earlier : null}
      <div ref={end} aria-hidden="true" />
    </section>
  );
}
