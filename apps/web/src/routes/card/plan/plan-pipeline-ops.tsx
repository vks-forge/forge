/**
 * PlanPipelineLine and PlanOpsEditor: a planned ticket's pipeline as the Director shaped it.
 *
 * Why: the Director may plan a ticket on its lane's pipeline plus a few changes (an extra
 *   security reviewer, a swapped agent, a dropped check), each with a reason. Approving the plan
 *   is approving those changes, so they sit on the ticket's row in plain words: "Standard + 2
 *   Director changes", then each change and why. A change that takes a stage away makes the plan
 *   a lighter pipeline than its lane, so it is flagged "Needs your approval" and the plan cannot
 *   start without the owner. In edit mode the owner can take any change off (undoable until
 *   saved) but never add one: the Director proposes, the owner only narrows.
 *
 * Exports: PlanPipelineLine, PlanOpsEditor.
 * Depends on: lucide-react, domain/director-change-copy, schemas/plan (types), types/plan.types.
 */

import { RotateCcw, X } from 'lucide-react';
import { laneWithOpsLine, lighterWords, opWords } from '#/domain/director-change-copy.js';
import type { PlanTicket } from '#/schemas/plan.js';

export function PlanPipelineLine(props: { ticket: PlanTicket }) {
  const { ticket } = props;
  const ops = ticket.pipeline?.ops;

  if (ops === undefined) {
    return null;
  }

  const lighter = lighterWords(ops);

  return (
    <div
      aria-label={`Pipeline of ${ticket.key}`}
      role="group"
      className="grid gap-1 rounded-lg border border-line p-2 text-xs"
    >
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium">
        <span>{laneWithOpsLine(ticket.lane, ops)}</span>
        {lighter === null ? null : (
          <span className="rounded-md border border-attn bg-attn-soft px-1.5 py-0.5">
            {lighter}
          </span>
        )}
      </p>
      <ul className="grid gap-0.5">
        {ops.map((op, position) => (
          <li key={position} className="min-w-0 break-words">
            <span className="font-medium">{opWords(op)}</span>
            <span className="text-muted">{`: ${op.reason}`}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PlanOpsEditor(props: {
  ticket: PlanTicket;
  dropped: readonly number[];
  disabled: boolean;
  onToggle: (position: number) => void;
}) {
  const ops = props.ticket.pipeline?.ops;

  if (ops === undefined) {
    return null;
  }

  return (
    <ul
      aria-label={`Director pipeline changes for ${props.ticket.key}`}
      className="grid gap-1 text-xs sm:col-span-4"
    >
      {ops.map((op, position) => {
        const off = props.dropped.includes(position);

        return (
          <li
            key={position}
            className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1"
          >
            <span
              className={`min-w-0 break-words ${off ? 'text-muted line-through' : ''}`}
            >
              <span className="font-medium">{opWords(op)}</span>
              {`: ${op.reason}`}
            </span>
            <button
              type="button"
              disabled={props.disabled}
              aria-label={`${off ? 'Keep' : 'Take off'}: ${opWords(op)} (${props.ticket.key})`}
              onClick={() => props.onToggle(position)}
              className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-line bg-surface px-2 font-medium hover:bg-hover disabled:cursor-not-allowed disabled:opacity-40"
            >
              {off ? (
                <RotateCcw aria-hidden="true" className="size-3.5" />
              ) : (
                <X aria-hidden="true" className="size-3.5" />
              )}
              {off ? 'Keep this change' : 'Take this change off'}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
