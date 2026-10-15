/**
 * BoardColumn: one column of the Board with its header and (virtualised) cards.
 *
 * Why: each column answers one question ("what needs me?", "what is moving?"), so its header
 *   says what the column means and how many tickets it holds, and the amber column is the only
 *   one with a coloured header. A column scrolls on its own so a long Done list never pushes
 *   the others off screen. An empty column says so in a sentence instead of leaving a blank.
 *
 * Exports: BoardColumnView.
 * Depends on: react, @forge/core (type), components/list/windowed-list, routes/board/ticket-card,
 *   types/board.types.
 */

import type { TicketSummary } from '@forge/core';
import { WindowedList } from '#/components/list/windowed-list.js';
import { TicketCard } from '#/routes/board/ticket-card.js';
import type { BoardColumn } from '#/types/board.types.js';

const TONE_BAR: Readonly<Record<BoardColumn['tone'], string>> = {
  neutral: 'bg-faint',
  signal: 'bg-signal',
  attn: 'bg-attn',
  good: 'bg-good',
  muted: 'bg-line',
};

export function BoardColumnView(props: {
  column: BoardColumn;
  tickets: readonly TicketSummary[];
  /** Why the column is empty: a filter hides tickets, or there are simply none. */
  filtered: boolean;
  now: number;
}) {
  const { column, tickets, filtered, now } = props;
  const headingId = `col-${column.id}`;

  return (
    <section
      aria-labelledby={headingId}
      className="flex w-[82vw] max-w-72 shrink-0 snap-start flex-col gap-3 rounded-2xl bg-rail p-3 md:w-60 md:max-w-none md:grow"
    >
      <header className="grid gap-0.5">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className={`h-4 w-1 rounded-full ${TONE_BAR[column.tone]}`}
          />
          <h2 id={headingId} className="text-sm font-semibold">
            {column.title}
          </h2>
          <span
            className="ml-auto rounded-md bg-hover px-1.5 font-data text-xs text-muted"
            aria-label={`${tickets.length} tickets`}
          >
            {tickets.length}
          </span>
        </div>
        <p className="pl-3 text-xs text-muted">{column.hint}</p>
      </header>
      {tickets.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line p-3 text-sm text-muted">
          {filtered ? 'No tickets match the filter.' : 'Nothing here.'}
        </p>
      ) : (
        <WindowedList
          items={tickets}
          getKey={(ticket) => ticket.id}
          label={`${column.title} tickets`}
          className="max-h-[68dvh] pr-1"
          renderItem={(ticket) => (
            <TicketCard ticket={ticket} now={now} showState={column.states.length > 1} />
          )}
        />
      )}
    </section>
  );
}
