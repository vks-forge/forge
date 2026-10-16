/**
 * TicketsBoard: the Board's Tickets view, six columns of tickets.
 *
 * Why: tickets are the units Workers build. This view loads the project's tickets once, groups
 *   them into columns on the client (domain/board-columns) and keeps them fresh by polling and
 *   refetching on focus. Every state is designed: skeleton while loading, an explanation when
 *   the project has no tickets yet (BoardEmpty, with the way to start), an error with retry when Forge is unreachable, and, when
 *   data is already on screen but a refresh fails or the browser is offline, a banner that
 *   says the columns may be stale rather than silently looking current.
 *
 * Exports: TicketsBoard.
 * Depends on: react, motion/react, api/use-tickets, api/describe-error, domain/board-columns,
 *   state/board-prefs, state/use-now, state/use-online, routes/board/*,
 *   components/status/state-panel, components/ui/button.
 */

import { LayoutGroup } from 'motion/react';
import { useMemo } from 'react';
import { describeError } from '#/api/describe-error.js';
import { useTicketBoard } from '#/api/use-tickets.js';
import { StatePanel } from '#/components/status/state-panel.js';
import { Button } from '#/components/ui/button.js';
import {
  BOARD_COLUMNS,
  filterTickets,
  groupByColumn,
  isFilterActive,
} from '#/domain/board-columns.js';
import { BoardColumnView } from '#/routes/board/board-column.js';
import { BoardEmpty } from '#/routes/board/board-empty.js';
import { BoardToolbar } from '#/routes/board/board-toolbar.js';
import { ColumnScroller } from '#/routes/board/column-shell.js';
import { useBoardPrefs } from '#/state/board-prefs.js';
import { useNow } from '#/state/use-now.js';
import { useOnline } from '#/state/use-online.js';

export function TicketsBoard(props: { slug: string }) {
  const { query, tickets } = useTicketBoard(props.slug);
  const { filter } = useBoardPrefs();
  const online = useOnline();
  const now = useNow();
  const visible = useMemo(() => filterTickets(tickets, filter), [tickets, filter]);
  const groups = useMemo(() => groupByColumn(visible), [visible]);
  const filtered = isFilterActive(filter);

  return (
    <>
      {query.isPending ? (
        <StatePanel kind="loading" label="Loading tickets" />
      ) : query.isError && tickets.length === 0 ? (
        <StatePanel
          kind="error"
          title={describeError(query.error).title}
          detail={describeError(query.error).detail}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : tickets.length === 0 ? (
        <BoardEmpty title="No tickets yet" columns={BOARD_COLUMNS}>
          Tell the Director what you want in the box above, and the tickets it plans for
          Workers will appear in these columns.
        </BoardEmpty>
      ) : (
        <>
          <BoardToolbar
            shown={visible.length}
            total={tickets.length}
            needsYou={groups.needs_you.length}
          />

          {!online ? (
            <p role="status" className="rounded-xl bg-attn-soft p-3 text-sm">
              You are offline. These columns are the last data Forge sent and may be out
              of date.
            </p>
          ) : query.isRefetchError ? (
            <p
              role="alert"
              className="flex flex-wrap items-center gap-3 rounded-xl bg-danger-soft p-3 text-sm"
            >
              Could not refresh the Board. {describeError(query.error).detail}
              <Button onClick={() => void query.refetch()}>Try again</Button>
            </p>
          ) : null}

          <LayoutGroup id="board">
            <ColumnScroller>
              {BOARD_COLUMNS.map((column) => (
                <BoardColumnView
                  key={column.id}
                  column={column}
                  tickets={groups[column.id]}
                  filtered={filtered}
                  now={now}
                />
              ))}
            </ColumnScroller>
          </LayoutGroup>

          {query.hasNextPage ? (
            <div className="flex items-center gap-3 text-sm text-muted">
              Showing the {tickets.length} most recently changed tickets.
              <Button
                onClick={() => void query.fetchNextPage()}
                status={query.isFetchingNextPage ? 'loading' : 'idle'}
              >
                Load older tickets
              </Button>
            </div>
          ) : null}
        </>
      )}
    </>
  );
}
