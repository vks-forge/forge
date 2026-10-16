/**
 * ToolbarShell, SearchField and FILTER_CONTROL: the filter bar both Board views share.
 *
 * Why: Cards and Tickets are filtered with the same kind of controls, so they sit in one bar
 *   with one look: labelled search and selects on the left, "Clear filters" only while a
 *   filter is on, and on the right a polite count ("2 of 6 cards") plus, when something waits
 *   on the user, an amber "N need you" so the most important fact is readable without
 *   scanning the columns. Amber appears only for that, never for decoration.
 *
 * Exports: ToolbarShell, ToolbarPicker, SearchField, FILTER_CONTROL.
 * Depends on: react, lucide-react.
 */

import { CircleAlert, Search } from 'lucide-react';
import type { ReactNode } from 'react';

export const FILTER_CONTROL =
  'min-h-9 rounded-lg border border-line bg-bg px-2 text-sm text-fg hover:border-faint';

export function SearchField(props: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-1 text-xs font-medium text-muted">
      Search
      <span className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted"
        />
        <input
          type="search"
          value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
          placeholder="Id or title"
          className={`${FILTER_CONTROL} w-full pl-8 sm:w-48`}
        />
      </span>
    </label>
  );
}

/** A labelled Picker slot: the visible label names the dropdown through `aria-labelledby`. */
export function ToolbarPicker(props: { label: string; id: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 text-xs font-medium text-muted">
      <span id={`${props.id}-label`}>{props.label}</span>
      <div className="w-44">{props.children}</div>
    </div>
  );
}

export function ToolbarShell(props: {
  /** Already phrased, such as "2 of 6 cards". */
  summary: string;
  /** How many items wait on the user right now; 0 hides the pill. */
  needsYou: number;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end gap-x-4 gap-y-3 rounded-xl border border-line bg-surface p-3">
      {props.children}
      <div className="ml-auto flex flex-wrap items-center gap-3 pb-2 text-xs text-muted">
        {props.needsYou > 0 ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-attn-soft px-1.5 py-0.5 font-medium text-fg">
            <CircleAlert aria-hidden="true" className="size-3.5 text-attn" />
            {props.needsYou} need you
          </span>
        ) : null}
        <p aria-live="polite">{props.summary}</p>
      </div>
    </div>
  );
}
