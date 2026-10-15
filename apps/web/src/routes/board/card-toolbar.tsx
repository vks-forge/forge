/**
 * CardToolbar: the filter above the Cards view's columns.
 *
 * Why: the user narrows cards by type (from the registry, so a type added in settings shows up
 *   without a code change) or by a word in the id or title. Filters are labelled controls and
 *   "Clear filters" appears only while one is active, so the way back is one click. The count
 *   is announced politely so a screen reader hears what the filter did.
 *
 * Exports: CardToolbar.
 * Depends on: react, lucide-react, @forge/core (type), domain/card-columns, state/board-prefs,
 *   components/ui/button.
 */

import type { CardType } from '@forge/core';
import { Search } from 'lucide-react';
import { Button } from '#/components/ui/button.js';
import { isCardFilterActive } from '#/domain/card-columns.js';
import { useBoardPrefs } from '#/state/board-prefs.js';

const CONTROL =
  'min-h-9 rounded-lg border border-line bg-surface px-2 text-sm text-fg hover:bg-hover';

export function CardToolbar(props: {
  shown: number;
  total: number;
  types: readonly CardType[] | undefined;
}) {
  const { cardFilter, setCardFilter, resetCardFilter } = useBoardPrefs();
  const known = props.types?.some((type) => type.name === cardFilter.type) ?? false;

  return (
    <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
      <label className="grid gap-1 text-xs text-muted">
        Search
        <span className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted"
          />
          <input
            type="search"
            value={cardFilter.query}
            onChange={(event) => setCardFilter({ query: event.target.value })}
            placeholder="Id or title"
            className={`${CONTROL} w-44 pl-8`}
          />
        </span>
      </label>

      <label className="grid gap-1 text-xs text-muted">
        Type
        <select
          value={cardFilter.type}
          onChange={(event) => setCardFilter({ type: event.target.value })}
          className={CONTROL}
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

      <p aria-live="polite" className="ml-auto pb-2 text-xs text-muted">
        {props.shown === props.total
          ? `${props.total} cards`
          : `${props.shown} of ${props.total} cards`}
      </p>
    </div>
  );
}
