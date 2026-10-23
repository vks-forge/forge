/**
 * DockReasons: the reasons an item waits on the owner, as a few chips with the full list on demand.
 *
 * Why: a plan needs approval for separate reasons (a protected path, an unverified outside
 *   fact, an overlap with another card), and the engine's sentence that joined them was too long
 *   to read in a dock that must stay short. Three short chips say what kind of attention this
 *   needs at a glance; "Reasons" opens the full text as a list (the one allowed second level of
 *   disclosure) and keeps the dock's height bounded by scrolling inside the list only.
 *
 * Exports: DockReasons.
 * Depends on: react, lucide-react, domain/needs-you-dock.
 */

import { ChevronDown } from 'lucide-react';
import { useId, useState } from 'react';
import { reasonChips } from '#/domain/needs-you-dock.js';

export function DockReasons(props: { reasons: readonly string[] }) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const { chips, hidden, needsDisclosure } = reasonChips(props.reasons);

  if (props.reasons.length === 0) {
    return null;
  }

  return (
    <div className="grid gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {open
          ? null
          : chips.map((chip, index) => (
              <span
                key={`${index}-${chip}`}
                className="max-w-full truncate rounded-md bg-hover px-2 py-0.5 text-xs"
              >
                {chip}
              </span>
            ))}
        {!open && hidden > 0 ? (
          <span className="text-xs text-muted">+{hidden} more</span>
        ) : null}
        {needsDisclosure ? (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={listId}
            onClick={() => setOpen((value) => !value)}
            className="inline-flex min-h-8 items-center gap-1 rounded-md px-1.5 text-xs font-medium text-signal hover:bg-hover"
          >
            Reasons
            <ChevronDown
              aria-hidden="true"
              className={`size-3.5 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
            />
          </button>
        ) : null}
      </div>
      {open ? (
        <ul
          id={listId}
          aria-label="Reasons"
          className="scroll-thin grid max-h-36 gap-1 overflow-y-auto pl-4 text-sm [&>li]:list-disc"
        >
          {props.reasons.map((reason, index) => (
            <li key={`${index}-${reason}`} className="min-w-0 break-words">
              {reason}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
