/**
 * EscalationBanner: the pinned notice that tickets of this card wait on the owner.
 *
 * Why: a stopped ticket, a Worker's question or a setup to fix is raised in the chat, but the chat
 *   scrolls and the page has other tabs. The banner stays above both, says how many tickets wait,
 *   names them (each a link to its Ticket page, where the same card lives, so there is always a
 *   way forward even when the chat has not loaded that far back) and one button brings the first
 *   one into view and focuses it. It lists only items already handed to the owner: while the
 *   Director is still looking at one, nothing is asked of the owner.
 *
 * Exports: EscalationBanner.
 * Depends on: lucide-react, components/ticket/ticket-link, components/ui/button.
 */

import { CircleAlert } from 'lucide-react';
import { TicketLink } from '#/components/ticket/ticket-link.js';
import { Button } from '#/components/ui/button.js';

export function EscalationBanner(props: {
  slug: string;
  ticketIds: readonly string[];
  count: number;
  onShowFirst: () => void;
}) {
  const { count } = props;

  return (
    <section
      aria-label="Tickets waiting on you"
      className="grid gap-3 rounded-2xl border-2 border-attn bg-attn-soft p-4"
    >
      <p className="flex items-start gap-2 text-sm font-semibold">
        <CircleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-attn" />
        <span>
          {count === 1
            ? 'A ticket is waiting on you'
            : `${count} tickets are waiting on you`}
        </span>
      </p>
      <p className="text-sm">
        {props.ticketIds.map((id, index) => (
          <span key={id}>
            {index > 0 ? ', ' : ''}
            <TicketLink id={id} slug={props.slug} />
          </span>
        ))}
      </p>
      <div>
        <Button variant="primary" onClick={props.onShowFirst}>
          {count === 1 ? 'Show it' : 'Show the first'}
        </Button>
      </div>
    </section>
  );
}
