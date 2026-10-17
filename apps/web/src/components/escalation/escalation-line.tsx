/**
 * EscalationLine: the chat's block for a ticket that waits on the owner.
 *
 * Why: the chat event only says that something was raised; the owner needs to see how it stands
 *   now and act on it without leaving the conversation. So the block is the live escalation card
 *   (settled once settled, wherever that happened). While the live list is still loading, or if
 *   the item is no longer in it (an older item beyond the list), the line stays useful: it names
 *   the problem and links to the ticket, where the same card lives.
 *
 * Exports: EscalationLine.
 * Depends on: components/escalation/escalation-card, components/ticket/ticket-link,
 *   schemas/escalation (type), types/cards-ui.types.
 */

import { EscalationCard } from '#/components/escalation/escalation-card.js';
import { TicketLink } from '#/components/ticket/ticket-link.js';
import type { EscalationView } from '#/schemas/escalation.js';

export function EscalationLine(props: {
  title: string;
  ticketId: string;
  slug: string;
  /** The live item; undefined while the list loads or when it is not in it. */
  view: EscalationView | undefined;
  loading: boolean;
}) {
  if (props.view !== undefined) {
    return (
      <div className="w-full max-w-[92%]">
        <EscalationCard view={props.view} />
      </div>
    );
  }

  return (
    <p className="flex flex-wrap items-center gap-x-1.5 text-sm">
      <span className="min-w-0 break-words font-medium">{props.title}</span>
      <TicketLink id={props.ticketId} slug={props.slug} />
      {props.loading ? <span className="text-xs text-muted">Loading…</span> : null}
    </p>
  );
}
