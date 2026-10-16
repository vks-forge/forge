/**
 * BoardColumn: one column of the Board with its header and (virtualised) cards.
 *
 * Why: each column answers one question ("what needs me?", "what is moving?"), so its header
 *   says what the column means and how many tickets it holds, and only the Needs you column
 *   turns amber (inside ColumnShell). A column scrolls on its own so a long Done list never
 *   pushes the others off screen. An empty column says so in a sentence instead of a blank.
 *
 * Exports: BoardColumnView.
 * Depends on: react, @forge/core (type), components/list/windowed-list, routes/board/column-shell, routes/board/ticket-card,
 *   types/board.types.
 */

import type { TicketSummary } from '@forge/core';
import { WindowedList } from '#/components/list/windowed-list.js';
import { ColumnShell } from '#/routes/board/column-shell.js';
import { TicketCard } from '#/routes/board/ticket-card.js';
import type { BoardColumn } from '#/types/board.types.js';

export function BoardColumnView(props: {
  column: BoardColumn;
  tickets: readonly TicketSummary[];
  /** Why the column is empty: a filter hides tickets, or there are simply none. */
  filtered: boolean;
  now: number;
}) {
  const { column, tickets, filtered, now } = props;

  return (
    <ColumnShell
      headingId={`col-${column.id}`}
      title={column.title}
      hint={column.hint}
      tone={column.tone}
      count={tickets.length}
      noun="tickets"
      filtered={filtered}
      {...(column.id === 'closed' ? { foldIn: 'tickets' } : {})}
    >
      <WindowedList
        items={tickets}
        getKey={(ticket) => ticket.id}
        label={`${column.title} tickets`}
        className="max-h-[68dvh] pr-1"
        renderItem={(ticket) => (
          <TicketCard ticket={ticket} now={now} showState={column.states.length > 1} />
        )}
      />
    </ColumnShell>
  );
}
