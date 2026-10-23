/**
 * EscalationLine: the chat's one-line record of a ticket that waited on the owner.
 *
 * Why: acting on a waiting ticket happens in the needs-you dock (and on the Ticket page and in
 *   the Inbox), all drawing the same escalation card, so the chat only keeps the history: which
 *   ticket, what it was, and how it stands now. The state is read from the live escalation, so
 *   it reads "Waiting on you" until someone acts and "Answered by you · 2 min ago" once any
 *   screen settled it. While the live list is still loading, or if the item is no longer in it
 *   (an older item beyond the list), the line stays useful: it names the problem and links to
 *   the ticket, where the same card lives.
 *
 * Exports: EscalationLine.
 * Depends on: lucide-react, components/ticket/ticket-link, domain/escalation-copy, state/use-now,
 *   schemas/escalation (type).
 */

import { Check, Eye } from 'lucide-react';
import { TicketLink } from '#/components/ticket/ticket-link.js';
import { settledLine } from '#/domain/escalation-copy.js';
import type { EscalationView } from '#/schemas/escalation.js';
import { useNow } from '#/state/use-now.js';

export function EscalationLine(props: {
  title: string;
  ticketId: string;
  slug: string;
  /** The live item; undefined while the list loads or when it is not in it. */
  view: EscalationView | undefined;
  loading: boolean;
}) {
  const now = useNow(60_000);
  const { view } = props;

  return (
    <div className="grid max-w-[92%] gap-0.5 border-l-2 border-line pl-3 text-sm">
      <p className="flex flex-wrap items-center gap-x-1.5">
        <span className="min-w-0 break-words font-medium">{props.title}</span>
        <TicketLink id={props.ticketId} slug={props.slug} />
      </p>
      {props.loading ? (
        <p className="text-xs text-muted">Loading…</p>
      ) : view?.settled !== undefined ? (
        <p className="flex items-center gap-1.5 text-xs font-medium">
          <Check aria-hidden="true" className="size-3.5 shrink-0 text-good" />
          {settledLine(view.settled, now, view.payload)}
        </p>
      ) : view?.stage === 'director' ? (
        <p className="flex items-center gap-1.5 text-xs text-muted">
          <Eye aria-hidden="true" className="size-3.5 shrink-0" />
          Director is looking at this
        </p>
      ) : view !== undefined ? (
        <p className="text-xs font-medium text-signal">Waiting on you</p>
      ) : null}
    </div>
  );
}
