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
 *   routes/board/toolbar-field, components/ui/button.
 */

import type { CardType } from '@forge/core';
import { Button } from '#/components/ui/button.js';
import { isCardFilterActive } from '#/domain/card-columns.js';
import {
  FILTER_CONTROL,
  SearchField,
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

      <label className="grid gap-1 text-xs font-medium text-muted">
        Type
        <select
          value={cardFilter.type}
          onChange={(event) => setCardFilter({ type: event.target.value })}
          className={FILTER_CONTROL}
        >
          <option value="all">All types</option>
          {/* A remembered type that the registry no longer lists stays selectable. */}
          {cardFilter.type !== 'all' && !known ? (
            <option value={cardFilter.type}>{cardFilter.type}</option>
          ) : null}
          {(props.types ?? []).map((type) => (
            <option key={type.name} value={type.name}>
              {type.label}
            </option>
          ))}
        </select>
      </label>

      {isCardFilterActive(cardFilter) ? (
        <Button onClick={resetCardFilter}>Clear filters</Button>
      ) : null}
    </ToolbarShell>
  );
}
