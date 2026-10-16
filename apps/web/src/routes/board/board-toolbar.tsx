/**
 * BoardToolbar: the filter above the Tickets view's columns.
 *
 * Why: the user narrows the Board's tickets by lane, state or a word. Filters are labelled
 *   controls, not icons, and "Clear filters" appears only while one is active, so the way back
 *   is always one click. The bar also says how many tickets wait on the user. (The Cards |
 *   Tickets switch lives in BoardViewSwitch.)
 *
 * Exports: BoardToolbar.
 * Depends on: react, @forge/core (schemas), domain/board-columns, state/board-prefs,
 *   routes/board/toolbar-field, components/ui/button.
 */

import { Lane, TicketStatus } from '@forge/core';
import { Button } from '#/components/ui/button.js';
import { isFilterActive, STATE_LABEL } from '#/domain/board-columns.js';
import {
  FILTER_CONTROL,
  SearchField,
  ToolbarShell,
} from '#/routes/board/toolbar-field.js';
import { useBoardPrefs } from '#/state/board-prefs.js';

export function BoardToolbar(props: { shown: number; total: number; needsYou: number }) {
  const { filter, setFilter, resetFilter } = useBoardPrefs();

  return (
    <ToolbarShell
      needsYou={props.needsYou}
      summary={
        props.shown === props.total
          ? `${props.total} tickets`
          : `${props.shown} of ${props.total} tickets`
      }
    >
      <SearchField value={filter.query} onChange={(query) => setFilter({ query })} />

      <label className="grid gap-1 text-xs font-medium text-muted">
        Lane
        <select
          value={filter.lane}
          onChange={(event) =>
            setFilter({ lane: event.target.value as typeof filter.lane })
          }
          className={FILTER_CONTROL}
        >
          <option value="all">All lanes</option>
          {Lane.options.map((lane) => (
            <option key={lane} value={lane}>
              {lane}
            </option>
          ))}
        </select>
      </label>

      <label className="grid gap-1 text-xs font-medium text-muted">
        State
        <select
          value={filter.state}
          onChange={(event) =>
            setFilter({ state: event.target.value as typeof filter.state })
          }
          className={FILTER_CONTROL}
        >
          <option value="all">All states</option>
          {TicketStatus.options.map((state) => (
            <option key={state} value={state}>
              {STATE_LABEL[state]}
            </option>
          ))}
        </select>
      </label>

      {isFilterActive(filter) ? (
        <Button onClick={resetFilter}>Clear filters</Button>
      ) : null}
    </ToolbarShell>
  );
}
