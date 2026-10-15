/**
 * BoardToolbar: the filter above the Tickets view's columns.
 *
 * Why: the user narrows the Board's tickets by lane, state or a word. Filters are labelled
 *   controls, not icons, and "Clear filters" appears only while one is active, so the way back
 *   is always one click. (The Cards | Tickets switch lives in BoardViewSwitch.)
 *
 * Exports: BoardToolbar.
 * Depends on: react, lucide-react, @forge/core (schemas), domain/board-columns,
 *   state/board-prefs, components/ui/button.
 */

import { Lane, TicketStatus } from '@forge/core';
import { Search } from 'lucide-react';
import { Button } from '#/components/ui/button.js';
import { isFilterActive, STATE_LABEL } from '#/domain/board-columns.js';
import { useBoardPrefs } from '#/state/board-prefs.js';

const CONTROL =
  'min-h-9 rounded-lg border border-line bg-surface px-2 text-sm text-fg hover:bg-hover';

export function BoardToolbar(props: { shown: number; total: number }) {
  const { filter, setFilter, resetFilter } = useBoardPrefs();
  const active = isFilterActive(filter);

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
            value={filter.query}
            onChange={(event) => setFilter({ query: event.target.value })}
            placeholder="Id or title"
            className={`${CONTROL} w-44 pl-8`}
          />
        </span>
      </label>

      <label className="grid gap-1 text-xs text-muted">
        Lane
        <select
          value={filter.lane}
          onChange={(event) =>
            setFilter({ lane: event.target.value as typeof filter.lane })
          }
          className={CONTROL}
        >
          <option value="all">All lanes</option>
          {Lane.options.map((lane) => (
            <option key={lane} value={lane}>
              {lane}
            </option>
          ))}
        </select>
      </label>

      <label className="grid gap-1 text-xs text-muted">
        State
        <select
          value={filter.state}
          onChange={(event) =>
            setFilter({ state: event.target.value as typeof filter.state })
          }
          className={CONTROL}
        >
          <option value="all">All states</option>
          {TicketStatus.options.map((state) => (
            <option key={state} value={state}>
              {STATE_LABEL[state]}
            </option>
          ))}
        </select>
      </label>

      {active ? <Button onClick={resetFilter}>Clear filters</Button> : null}

      <p aria-live="polite" className="ml-auto pb-2 text-xs text-muted">
        {props.shown === props.total
          ? `${props.total} tickets`
          : `${props.shown} of ${props.total} tickets`}
      </p>
    </div>
  );
}
