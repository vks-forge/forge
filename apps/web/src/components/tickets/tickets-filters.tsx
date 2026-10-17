/**
 * TicketsFilters: the search box, state multi-select, lane select and sort picker above the Tickets table.
 *
 * Why: a project accumulates hundreds of tickets and the owner usually hunts for one kind
 *   ("what is waiting on me", "that CSV ticket"). The controls are always visible (nothing to
 *   recall), search waits 300 ms after the last keystroke so typing does not fire a request
 *   per letter, and "Clear filters" appears only when something narrows the list. The
 *   search text is local while typing and reaches the URL after the pause; when the URL
 *   changes by itself (back, forward, Clear) the box follows it.
 *
 * Exports: TicketsFilters, SEARCH_DEBOUNCE_MS.
 * Depends on: react, lucide-react, @forge/core, components/ui/button, components/ui/field, components/ui/picker,
 *   domain/board-columns, types/tickets-table.types.
 */

import type { Lane, TicketStatus } from '@forge/core';
import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '#/components/ui/button.js';
import { INPUT_CLASS } from '#/components/ui/field.js';
import { Picker } from '#/components/ui/picker.js';
import { STATE_LABEL } from '#/domain/board-columns.js';
import type { TicketSortKey } from '#/schemas/tickets-table.js';
import type { TicketsFiltersProps } from '#/types/tickets-table.types.js';

export const SEARCH_DEBOUNCE_MS = 300;

const STATES = Object.keys(STATE_LABEL) as TicketStatus[];
const SORTS: readonly (readonly [TicketSortKey, string])[] = [
  ['updated', 'Recently updated'],
  ['created', 'Recently created'],
  ['cost', 'Highest cost'],
];

const LANES: readonly Lane[] = ['express', 'standard', 'full'];

export function TicketsFilters(props: TicketsFiltersProps) {
  const { params, onChange, onClear, filtered } = props;
  const [text, setText] = useState(params.q);

  const [seenQ, setSeenQ] = useState(params.q);

  // Back, forward and Clear change the URL; the box shows what the URL says.
  if (seenQ !== params.q) {
    setSeenQ(params.q);
    setText(params.q);
  }

  useEffect(() => {
    const next = text.trim();
    if (next === params.q) {
      return undefined;
    }

    const timer = window.setTimeout(() => onChange({ q: next }), SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [text, params.q, onChange]);

  return (
    <form
      role="search"
      aria-label="Filter tickets"
      className="flex flex-wrap items-end gap-3"
      onSubmit={(event) => event.preventDefault()}
    >
      <div className="grid gap-1">
        <label htmlFor="tickets-search" className="text-xs font-medium text-muted">
          Search
        </label>
        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-faint"
          />
          <input
            id="tickets-search"
            type="search"
            value={text}
            placeholder="Id or title"
            autoComplete="off"
            onChange={(event) => setText(event.target.value)}
            className={`${INPUT_CLASS} w-56 pl-8`}
          />
        </div>
      </div>

      <div className="grid gap-1">
        <span id="tickets-state-label" className="text-xs font-medium text-muted">
          State
        </span>
        <Picker
          multiple
          aria-labelledby="tickets-state-label"
          placeholder="All states"
          value={params.states}
          items={STATES.map((state) => ({ value: state, label: STATE_LABEL[state] }))}
          onChange={(states) => onChange({ states: states as TicketStatus[] })}
          className="w-44"
        />
      </div>

      <div className="grid gap-1">
        <span id="tickets-lane-label" className="text-xs font-medium text-muted">
          Lane
        </span>
        <Picker
          aria-labelledby="tickets-lane-label"
          value={params.lane ?? ''}
          items={[
            { value: '', label: 'All lanes' },
            ...LANES.map((lane) => ({ value: lane, label: lane })),
          ]}
          onChange={(lane) => onChange({ lane: (lane || null) as Lane | null })}
          className="w-36"
        />
      </div>

      <div className="grid gap-1">
        <span id="tickets-sort-label" className="text-xs font-medium text-muted">
          Sort by
        </span>
        <Picker
          aria-labelledby="tickets-sort-label"
          value={params.sort}
          items={SORTS.map(([value, label]) => ({ value, label }))}
          onChange={(sort) => onChange({ sort: sort as TicketSortKey })}
          className="w-44"
        />
      </div>

      {filtered ? <Button onClick={onClear}>Clear filters</Button> : null}
    </form>
  );
}
