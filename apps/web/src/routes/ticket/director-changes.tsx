/**
 * DirectorChanges: the "Changed by the Director" line over the strip, its log, and the ghost of a removed stage.
 *
 * Why: the owner approved the lane and the plan; the Director may then add a reviewer, move a
 *   check or (only with the owner's approval of the plan) drop one. The strip must make that
 *   visible without hunting: one headline counting the changes, a log that opens on demand and
 *   lists every change with its reason, plus the ones the engine could not apply (so "I asked
 *   for it and nothing happened" has an answer), and a stage that was removed stays on the strip
 *   as a dashed ghost with the reason, because a vanished stage is the one change nobody would
 *   notice. Nothing renders for a ticket the Director left alone.
 *
 * Exports: DirectorChangesBar, RemovedGhost.
 * Depends on: lucide-react, react, domain/director-change-copy, @forge/core (types).
 */

import { ChevronRight } from 'lucide-react';
import { useState } from 'react';
import type { TicketPipelineView } from '@forge/core';
import {
  adjustmentLine,
  changesHeadline,
  removedLine,
} from '#/domain/director-change-copy.js';

export function DirectorChangesBar(props: {
  adjustments: TicketPipelineView['adjustments'];
}) {
  const [open, setOpen] = useState(false);

  if (props.adjustments.length === 0) {
    return null;
  }

  const logId = 'director-adjustment-log';

  return (
    <div className="grid gap-1.5">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={logId}
        onClick={() => setOpen(!open)}
        className="inline-flex min-h-9 w-fit items-center gap-1 rounded-lg text-sm font-medium hover:text-signal"
      >
        <ChevronRight
          aria-hidden="true"
          className={`size-4 transition-transform duration-150 ${open ? 'rotate-90' : ''}`}
        />
        {changesHeadline(props.adjustments)}
      </button>
      {open ? (
        <ol
          id={logId}
          aria-label="What the Director changed"
          className="grid gap-1 border-l-2 border-line pl-3 text-sm"
        >
          {props.adjustments.map((adjustment) => (
            <li
              key={adjustment.seq}
              className={`min-w-0 break-words ${
                adjustment.status === 'dropped' ? 'text-muted' : ''
              }`}
            >
              {adjustmentLine(adjustment)}
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}

export function RemovedGhost(props: { removed: TicketPipelineView['removed'][number] }) {
  const { removed } = props;

  return (
    <div className="grid min-h-11 max-w-xs gap-0.5 rounded-lg border border-dashed border-line px-3 py-1 text-sm text-muted">
      <span className="font-medium line-through">{removed.label}</span>
      <span className="text-xs">{removedLine(removed)}</span>
    </div>
  );
}
