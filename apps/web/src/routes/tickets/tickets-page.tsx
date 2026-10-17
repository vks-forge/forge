/**
 * TicketsPage: every ticket of a project in one filterable, sortable, paged table.
 *
 * Why: the Board shows tickets by state, but to find one ticket, see what the work cost or
 *   check everything of one lane the owner needs a list. The page holds no state of its own:
 *   filters, sort, page and page size live in the URL (back/forward, reload and shared links
 *   all work; invalid values fall back to defaults) and the server does the filtering and
 *   paging. It says when the project has no tickets, when filters match none (with a way to
 *   clear them), shows skeleton rows while loading and an error with Retry when Forge cannot
 *   be reached.
 *
 * Exports: TicketsPage.
 * Depends on: react, react-router, api/use-tickets-table, api/describe-error, components/*,
 *   domain/tickets-table-params.
 */

import { Layers } from 'lucide-react';
import { useCallback, useEffect, useMemo } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { describeError } from '#/api/describe-error.js';
import { useTicketsTable } from '#/api/use-tickets-table.js';
import { OfflineNotice } from '#/components/status/offline-notice.js';
import { StatePanel } from '#/components/status/state-panel.js';
import { TicketsFilters } from '#/components/tickets/tickets-filters.js';
import { TicketsPager } from '#/components/tickets/tickets-pager.js';
import { TicketsTable } from '#/components/tickets/tickets-table.js';
import { Button } from '#/components/ui/button.js';
import { EmptyState } from '#/components/ui/empty-state.js';
import { projectPath } from '#/domain/nav-entries.js';
import {
  DEFAULT_PARAMS,
  hasActiveFilters,
  pageWindow,
  parseTicketsParams,
  toTicketsSearch,
} from '#/domain/tickets-table-params.js';
import type { TicketSortKey, TicketsTableParams } from '#/schemas/tickets-table.js';

/** Fields that narrow or reorder the list: changing one starts again from page one. */
const RESETS_PAGE: readonly (keyof TicketsTableParams)[] = [
  'states',
  'lane',
  'q',
  'sort',
  'size',
];

export function TicketsPage() {
  const { slug = '' } = useParams();
  const [search, setSearch] = useSearchParams();
  const params = useMemo(() => parseTicketsParams(search), [search]);
  const list = useTicketsTable(slug, params);
  const filtered = hasActiveFilters(params);

  useEffect(() => {
    document.title = 'Tickets · Forge';
  }, []);

  const change = useCallback(
    (patch: Partial<TicketsTableParams>, replace = 'q' in patch): void => {
      setSearch(
        (previous) => {
          const current = parseTicketsParams(previous);
          const page = RESETS_PAGE.some((key) => key in patch) ? { page: 1 } : {};

          return toTicketsSearch({ ...current, ...page, ...patch });
        },
        // Keystrokes (and the clamp below) replace; filters, sort and paging are history entries.
        { replace },
      );
    },
    [setSearch],
  );

  const clear = (): void =>
    setSearch(
      toTicketsSearch({
        ...DEFAULT_PARAMS,
        sort: params.sort,
        size: params.size,
      }),
    );

  const total = list.data?.total;
  const lastPage = total === undefined ? 1 : pageWindow(1, params.size, total).pages;

  // A link past the end (tickets were removed, or a hand-edited page) lands on the last page.
  useEffect(() => {
    if (total !== undefined && !list.isPlaceholderData && params.page > lastPage) {
      change({ page: lastPage }, true);
    }
  }, [total, list.isPlaceholderData, params.page, lastPage, change]);

  const onSort = (key: TicketSortKey): void => change({ sort: key });

  let body;
  if (list.isError && !list.data) {
    const { title, detail } = describeError(list.error);

    body = (
      <StatePanel
        kind="error"
        title={title}
        detail={detail}
        onRetry={() => void list.refetch()}
        retrying={list.isFetching}
      />
    );
  } else if (list.isPending) {
    body = (
      <div role="status" aria-label="Loading tickets">
        <TicketsTable
          slug={slug}
          rows={null}
          params={params}
          stale={false}
          onSort={onSort}
        />
      </div>
    );
  } else if (list.data && list.data.total === 0) {
    body = filtered ? (
      <EmptyState
        title="No ticket matches these filters"
        icon={Layers}
        actions={<Button onClick={clear}>Clear filters</Button>}
      >
        Try a different search, or widen the state and lane.
      </EmptyState>
    ) : (
      <EmptyState
        title="No tickets yet"
        icon={Layers}
        actions={
          <Link
            to={projectPath(slug, 'board')}
            className="text-sm font-medium text-signal hover:underline"
          >
            Open the Board
          </Link>
        }
      >
        Tickets appear here once the Director plans a card into work.
      </EmptyState>
    );
  } else if (list.data) {
    body = (
      <>
        <TicketsTable
          slug={slug}
          rows={list.data.items}
          params={params}
          stale={list.isPlaceholderData}
          onSort={onSort}
        />
        <TicketsPager params={params} total={list.data.total} onChange={change} />
      </>
    );
  }

  return (
    <section className="grid gap-4">
      <header className="grid gap-1">
        <p className="font-data text-xs text-muted">{slug}</p>
        <h1 className="text-2xl font-semibold tracking-tight">Tickets</h1>
        <p className="max-w-prose text-sm text-muted">
          Every ticket of this project. Open one to read its thread, runs and cost.
        </p>
      </header>

      <OfflineNotice>
        You are offline. This list is the last one loaded and will not refresh.
      </OfflineNotice>

      <TicketsFilters
        params={params}
        onChange={change}
        onClear={clear}
        filtered={filtered}
      />

      {body}
    </section>
  );
}
