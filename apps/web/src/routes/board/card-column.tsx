/**
 * CardColumnView: one column of the Cards view with its header and (virtualised) tiles.
 *
 * Why: each column answers one question ("what needs me?", "what is moving?"), so its header
 *   says what the column means and how many cards it holds, and only the Needs you column
 *   turns amber (inside ColumnShell). A column scrolls on its own, so a long Done list never pushes the others
 *   off screen, and past 100 cards it is windowed. An empty column says why in a sentence.
 *
 * Exports: CardColumnView.
 * Depends on: react, @forge/core (types), components/list/windowed-list, routes/board/card-tile,
 *   routes/board/column-shell,
 *   types/cards-ui.types.
 */

import type { CardType } from '@forge/core';
import { WindowedList } from '#/components/list/windowed-list.js';
import { CardTile } from '#/routes/board/card-tile.js';
import { ColumnShell } from '#/routes/board/column-shell.js';
import type { CardSummary } from '#/schemas/cards.js';
import type { CardColumnDef } from '#/types/cards-ui.types.js';

export function CardColumnView(props: {
  column: CardColumnDef;
  cards: readonly CardSummary[];
  types: readonly CardType[] | undefined;
  /** Why the column is empty: a filter hides cards, or there are simply none. */
  filtered: boolean;
  now: number;
  /** Cards outside the hovered or focused card's dependency chain; empty when none is. */
  dimmed: ReadonlySet<string>;
  onHighlight: (id: string | null) => void;
}) {
  const { column, cards, types, filtered, now, dimmed, onHighlight } = props;

  return (
    <ColumnShell
      headingId={`card-col-${column.id}`}
      title={column.title}
      hint={column.hint}
      tone={column.tone}
      count={cards.length}
      noun="cards"
      filtered={filtered}
      {...(column.id === 'closed' ? { foldIn: 'cards' } : {})}
    >
      <WindowedList
        items={cards}
        getKey={(card) => card.id}
        label={`${column.title} cards`}
        renderItem={(card) => (
          <CardTile
            card={card}
            types={types}
            now={now}
            dimmed={dimmed.has(card.id)}
            onHighlight={onHighlight}
          />
        )}
      />
    </ColumnShell>
  );
}
