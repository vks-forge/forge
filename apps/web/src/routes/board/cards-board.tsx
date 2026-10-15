/**
 * CardsBoard: the Board's Cards view, six columns of requests.
 *
 * Why: the Cards view is the default way into a project's work: each request (a card) in the
 *   column the server rolled up from its tickets and questions (d-0107), with the Needs you
 *   column in amber. It keeps itself fresh by polling and refetching on focus, and every state
 *   is designed: skeleton while loading, an explanation when there are no cards yet (the Ask
 *   the Director box above is how to start one), an error with retry when Forge is unreachable,
 *   and, when data is on screen but a refresh fails or the browser is offline, a banner that
 *   says the columns may be stale rather than silently looking current.
 *
 * Exports: CardsBoard.
 * Depends on: react, motion/react, api/use-card-board, api/describe-error, domain/card-columns,
 *   state/board-prefs, state/use-now, state/use-online, routes/board/*, components/status/state-panel.
 */

import { LayoutGroup } from 'motion/react';
import { useMemo } from 'react';
import { describeError } from '#/api/describe-error.js';
import { useCardBoard, useCardTypes } from '#/api/use-card-board.js';
import { StatePanel } from '#/components/status/state-panel.js';
import { Button } from '#/components/ui/button.js';
import {
  CARD_BOARD_COLUMNS,
  filterCards,
  groupCards,
  isCardFilterActive,
} from '#/domain/card-columns.js';
import { CardColumnView } from '#/routes/board/card-column.js';
import { CardToolbar } from '#/routes/board/card-toolbar.js';
import { useBoardPrefs } from '#/state/board-prefs.js';
import { useNow } from '#/state/use-now.js';
import { useOnline } from '#/state/use-online.js';

export function CardsBoard(props: { slug: string }) {
  const { query, cards } = useCardBoard(props.slug);
  const types = useCardTypes();
  const { cardFilter } = useBoardPrefs();
  const online = useOnline();
  const now = useNow();
  const visible = useMemo(() => filterCards(cards, cardFilter), [cards, cardFilter]);
  const groups = useMemo(() => groupCards(visible), [visible]);

  if (query.isPending) {
    return <StatePanel kind="loading" label="Loading cards" />;
  }

  if (query.isError && cards.length === 0) {
    return (
      <StatePanel
        kind="error"
        title={describeError(query.error).title}
        detail={describeError(query.error).detail}
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
      />
    );
  }

  if (cards.length === 0) {
    return (
      <StatePanel kind="empty" title="No cards yet">
        Tell the Director what you want above. Each request becomes a card you can talk
        through with it.
      </StatePanel>
    );
  }

  return (
    <>
      <CardToolbar shown={visible.length} total={cards.length} types={types.data} />

      {!online ? (
        <p role="status" className="rounded-xl bg-attn-soft p-3 text-sm">
          You are offline. These columns are the last data Forge sent and may be out of
          date.
        </p>
      ) : query.isRefetchError ? (
        <p
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-xl bg-danger-soft p-3 text-sm"
        >
          Could not refresh the cards. {describeError(query.error).detail}
          <Button onClick={() => void query.refetch()}>Try again</Button>
        </p>
      ) : null}

      <LayoutGroup id="card-board">
        <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-3 md:-mx-8 md:px-8">
          {CARD_BOARD_COLUMNS.map((column) => (
            <CardColumnView
              key={column.id}
              column={column}
              cards={groups[column.id]}
              types={types.data}
              filtered={isCardFilterActive(cardFilter)}
              now={now}
            />
          ))}
        </div>
      </LayoutGroup>

      {query.hasNextPage ? (
        <div className="flex items-center gap-3 text-sm text-muted">
          Showing the {cards.length} most recently changed cards.
          <Button
            onClick={() => void query.fetchNextPage()}
            status={query.isFetchingNextPage ? 'loading' : 'idle'}
          >
            Load older cards
          </Button>
        </div>
      ) : null}
    </>
  );
}
