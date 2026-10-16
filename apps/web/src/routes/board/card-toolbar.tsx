/**
 * CardToolbar: the filter above the Cards view's columns.
 *
 * Why: the user narrows cards by type (from the registry, so a type added in settings shows up
 *   without a code change) or by a word in the id or title. Filters are labelled controls and
 *   "Clear filters" appears only while one is active, so the way back is one click. The count
 *   is announced politely so a screen reader hears what the filter did, and the bar says how
 *   many cards wait on the user.
 *
 * Exports: CardToolbar.
 * Depends on: react, @forge/core (type), domain/card-columns, state/board-prefs,
 *   routes/board/toolbar-field, components/ui/{button,picker}.
 */

import type { CardType } from '@forge/core';
import { Button } from '#/components/ui/button.js';
import { Picker } from '#/components/ui/picker.js';
import { isCardFilterActive } from '#/domain/card-columns.js';
import {
  SearchField,
  ToolbarPicker,
  ToolbarShell,
} from '#/routes/board/toolbar-field.js';
import { useBoardPrefs } from '#/state/board-prefs.js';

export function CardToolbar(props: {
  shown: number;
  total: number;
  needsYou: number;
  types: readonly CardType[] | undefined;
}) {
  const { cardFilter, setCardFilter, resetCardFilter } = useBoardPrefs();
  const known = props.types?.some((type) => type.name === cardFilter.type) ?? false;
  const typeItems = [
    { value: 'all', label: 'All types' },
    // A remembered type that the registry no longer lists stays selectable.
    ...(cardFilter.type !== 'all' && !known
      ? [{ value: cardFilter.type, label: cardFilter.type }]
      : []),
    ...(props.types ?? []).map((type) => ({ value: type.name, label: type.label })),
  ];

  return (
    <ToolbarShell
      needsYou={props.needsYou}
      summary={
        props.shown === props.total
          ? `${props.total} cards`
          : `${props.shown} of ${props.total} cards`
      }
    >
      <SearchField
        value={cardFilter.query}
        onChange={(query) => setCardFilter({ query })}
      />

      <ToolbarPicker label="Type" id="board-type">
        <Picker
          aria-labelledby="board-type-label"
          items={typeItems}
          value={cardFilter.type}
          onChange={(type) => setCardFilter({ type })}
        />
      </ToolbarPicker>

      {isCardFilterActive(cardFilter) ? (
        <Button onClick={resetCardFilter}>Clear filters</Button>
      ) : null}
    </ToolbarShell>
  );
}
