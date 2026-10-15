/**
 * Small status chips: ticket state, run status, lane.
 *
 * Why: the same facts appear on Board cards, the Ticket header, the runs list and the thread.
 *   Drawing them in one place keeps meaning constant: amber is only ever "needs you", cobalt
 *   is the live thing, red is failure, and no chip relies on colour alone (each has words,
 *   most have an icon).
 *
 * Exports: StateChip, RunChip, LaneChip.
 * Depends on: react, lucide-react, @forge/core (types), domain/board-columns, domain/run-status.
 */

import type { Lane, RunStatus, TicketStatus } from '@forge/core';
import { NEEDS_YOU_STATUSES } from '@forge/core';
import { CircleAlert, CircleCheck, CircleDot, CircleX, Clock } from 'lucide-react';
import { STATE_LABEL } from '#/domain/board-columns.js';
import { RUN_STATUS_LABEL, runTone } from '#/domain/run-status.js';
import type { RunTone } from '#/types/ticket-view.types.js';

const CHIP =
  'inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-xs font-medium';

/** The ticket's state in words; amber with an alert icon when it waits on the user. */
export function StateChip(props: { state: TicketStatus }) {
  const needsYou = NEEDS_YOU_STATUSES.includes(props.state);
  const done = props.state === 'done';
  const tone = needsYou
    ? 'bg-attn-soft text-fg'
    : done
      ? 'bg-hover text-good'
      : 'bg-hover text-muted';

  return (
    <span className={`${CHIP} ${tone}`}>
      {needsYou ? (
        <CircleAlert aria-hidden="true" className="size-3.5 text-attn" />
      ) : null}
      {done ? <CircleCheck aria-hidden="true" className="size-3.5" /> : null}
      {STATE_LABEL[props.state]}
    </span>
  );
}

const RUN_TONE: Readonly<Record<RunTone, { text: string; icon: typeof CircleDot }>> = {
  live: { text: 'text-signal', icon: CircleDot },
  good: { text: 'text-good', icon: CircleCheck },
  bad: { text: 'text-danger', icon: CircleX },
  quiet: { text: 'text-muted', icon: Clock },
};

export function RunChip(props: { status: RunStatus }) {
  const { text, icon: Icon } = RUN_TONE[runTone(props.status)];

  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${text}`}>
      <Icon aria-hidden="true" className="size-3.5" />
      {RUN_STATUS_LABEL[props.status]}
    </span>
  );
}

export function LaneChip(props: { lane: Lane }) {
  return (
    <span className="rounded-md border border-line px-1.5 py-0.5 font-data text-xs text-muted">
      {props.lane}
    </span>
  );
}
