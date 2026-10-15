/**
 * CardColumnView: one column of the Cards view with its header and (virtualised) tiles.
 *
 * Why: each column answers one question ("what needs me?", "what is moving?"), so its header
 *   says what the column means and how many cards it holds, and only the amber column has a
 *   coloured header. A column scrolls on its own, so a long Done list never pushes the others
 *   off screen, and past 100 cards it is windowed. An empty column says why in a sentence.
 *
 * Exports: CardColumnView.
 * Depends on: react, @forge/core (types), components/list/windowed-list, routes/board/card-tile,
 *   types/cards-ui.types.
 */

import type { CardSummary, CardType } from '@forge/core';
import { WindowedList } from '#/components/list/windowed-list.js';
import { CardTile } from '#/routes/board/card-tile.js';
import type { ColumnTone } from '#/types/board.types.js';
import type { CardColumnDef } from '#/types/cards-ui.types.js';

const TONE_BAR: Readonly<Record<ColumnTone, string>> = {
  neutral: 'bg-faint',
  signal: 'bg-signal',
  attn: 'bg-attn',
  good: 'bg-good',
  muted: 'bg-line',
};

export function CardColumnView(props: {
  column: CardColumnDef;
  cards: readonly CardSummary[];
  types: readonly CardType[] | undefined;
  /** Why the column is empty: a filter hides cards, or there are simply none. */
  filtered: boolean;
  now: number;
}) {
  const { column, cards, types, filtered, now } = props;
  const headingId = `card-col-${column.id}`;

  return (
    <section
      aria-labelledby={headingId}
      className="flex w-[82vw] max-w-72 shrink-0 snap-start flex-col gap-3 rounded-2xl bg-rail p-3 md:w-56 md:max-w-none md:grow"
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
            aria-label={`${cards.length} cards`}
          >
            {cards.length}
          </span>
        </div>
        <p className="pl-3 text-xs text-muted">{column.hint}</p>
      </header>
      {cards.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line p-3 text-sm text-muted">
          {filtered ? 'No cards match the filter.' : 'Nothing here.'}
        </p>
      ) : (
        <WindowedList
          items={cards}
          getKey={(card) => card.id}
          label={`${column.title} cards`}
          className="max-h-[68dvh] pr-1"
          renderItem={(card) => <CardTile card={card} types={types} now={now} />}
        />
      )}
    </section>
  );
}
