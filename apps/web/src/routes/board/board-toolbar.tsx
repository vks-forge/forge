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
 *   routes/board/toolbar-field, components/ui/{button,picker}.
 */

import { Lane, TicketStatus } from '@forge/core';
import { Button } from '#/components/ui/button.js';
import { Picker } from '#/components/ui/picker.js';
import { isFilterActive, STATE_LABEL } from '#/domain/board-columns.js';
import {
  SearchField,
  ToolbarPicker,
  ToolbarShell,
} from '#/routes/board/toolbar-field.js';
import { useBoardPrefs } from '#/state/board-prefs.js';

const LANE_ITEMS = [
  { value: 'all', label: 'All lanes' },
  ...Lane.options.map((lane) => ({ value: lane, label: lane })),
];

const STATE_ITEMS = [
  { value: 'all', label: 'All states' },
  ...TicketStatus.options.map((state) => ({ value: state, label: STATE_LABEL[state] })),
];

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

      <ToolbarPicker label="Lane" id="board-lane">
        <Picker
          aria-labelledby="board-lane-label"
          items={LANE_ITEMS}
          value={filter.lane}
          onChange={(lane) => setFilter({ lane: lane as typeof filter.lane })}
        />
      </ToolbarPicker>

      <ToolbarPicker label="State" id="board-state">
        <Picker
          aria-labelledby="board-state-label"
          items={STATE_ITEMS}
          value={filter.state}
          onChange={(state) => setFilter({ state: state as typeof filter.state })}
        />
      </ToolbarPicker>

      {isFilterActive(filter) ? (
        <Button onClick={resetFilter}>Clear filters</Button>
      ) : null}
    </ToolbarShell>
  );
}
