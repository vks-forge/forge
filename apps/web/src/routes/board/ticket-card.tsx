/**
 * TicketCard: one ticket on the Board.
 *
 * Why: a person scanning the Board decides in a second what to open. The card therefore shows
 *   only what separates tickets: id and title (the whole card is one link to the Ticket page,
 *   d-0116), the lane, the exact state when a column holds several, the current run's status,
 *   rework count and, in amber, that it waits on the user. Amber appears nowhere else on a
 *   card, so it keeps its meaning.
 *
 * Exports: TicketCard.
 * Depends on: react, lucide-react, @forge/core (type), components/ticket/*, domain/relative-time.
 */

import type { TicketSummary } from '@forge/core';
import { CircleAlert, RotateCcw } from 'lucide-react';
import { LaneChip, RunChip, StateChip } from '#/components/ticket/status-chips.js';
import { TicketLink } from '#/components/ticket/ticket-link.js';
import { timeAgo } from '#/domain/relative-time.js';

export function TicketCard(props: {
  ticket: TicketSummary;
  /** Show the exact state: true in columns that group several states. */
  showState: boolean;
  now: number;
}) {
  const { ticket, showState, now } = props;

  return (
    <article
      className={`relative grid gap-2 rounded-xl border bg-surface p-3 shadow-[0_1px_2px_oklch(25%_0.03_255/0.06)] transition-[background-color,border-color] duration-150 hover:bg-hover focus-within:bg-hover ${
        ticket.needs_you ? 'border-attn' : 'border-line'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="whitespace-nowrap font-data text-xs text-muted">
          {ticket.id}
        </span>
        <LaneChip lane={ticket.lane} />
      </div>
      <h3 className="text-sm font-medium leading-snug">
        <TicketLink
          id={ticket.id}
          slug={ticket.project}
          className="text-fg no-underline after:absolute after:inset-0 after:rounded-xl hover:no-underline"
        >
          {ticket.title}
        </TicketLink>
      </h3>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {ticket.needs_you ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-attn-soft px-1.5 py-0.5 text-xs font-medium">
            <CircleAlert aria-hidden="true" className="size-3.5 text-attn" />
            Needs you
          </span>
        ) : null}
        {showState && !ticket.needs_you ? <StateChip state={ticket.state} /> : null}
        {ticket.run_status ? <RunChip status={ticket.run_status} /> : null}
        {ticket.rework_count > 0 ? (
          <span
            className="inline-flex items-center gap-1 text-xs text-muted"
            title="Sent back for rework"
          >
            <RotateCcw aria-hidden="true" className="size-3.5" />
            Rework ×{ticket.rework_count}
          </span>
        ) : null}
        <span className="ml-auto text-xs text-muted">
          {timeAgo(ticket.updated_at, now)}
        </span>
      </div>
      {ticket.blocked_reason ? (
        <p className="text-xs text-muted">{ticket.blocked_reason}</p>
      ) : null}
    </article>
  );
}
