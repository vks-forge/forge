/**
 * TileAction: the one action a ticket tile offers when it fits.
 *
 * Why: when a ticket waits on the owner or is parked, the Board should let them act without
 *   opening it. "Retry" appears only when the server offered it (a retry-cap or crash question
 *   exists for the ticket) and uses the same call as the Ticket page; "Open to answer" appears
 *   when the ticket waits for the owner, as a link to its page where the question lives. Nothing
 *   else is offered here: Cancel, Re-plan and the like stay on the page with their confirmations.
 *   The control sits above the tile's link overlay and keeps a 36 px hit area. A failed Retry says
 *   so on the tile and points at the page, never a silent failure.
 *
 * Exports: TileAction.
 * Depends on: lucide-react, react-router, @forge/core (type), api/use-tile-retry, components/ui/button,
 *   domain/ticket-paths.
 */

import type { TicketSummary } from '@forge/core';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router';
import { useTileRetry } from '#/api/use-tile-retry.js';
import { Button } from '#/components/ui/button.js';
import { ticketPath } from '#/domain/ticket-paths.js';

function RetryButton(props: { ticket: TicketSummary; escalationId: string }) {
  const { ticket } = props;
  const retry = useTileRetry({
    escalationId: props.escalationId,
    ticketId: ticket.id,
    cardId: ticket.card_id,
  });

  return (
    <div className="relative z-10 grid gap-1">
      <Button
        variant="quiet"
        status={retry.isPending ? 'loading' : retry.isError ? 'error' : 'idle'}
        aria-label={`Retry ${ticket.id}`}
        onClick={() => retry.mutate()}
        className="w-fit"
      >
        Retry
      </Button>
      {retry.isError ? (
        <p role="alert" className="text-xs text-danger">
          Retry did not start. Open the ticket to see why.
        </p>
      ) : null}
    </div>
  );
}

export function TileAction(props: { ticket: TicketSummary }) {
  const { ticket } = props;

  if (ticket.retry_escalation_id !== undefined) {
    return <RetryButton ticket={ticket} escalationId={ticket.retry_escalation_id} />;
  }

  if (ticket.wait?.phase === 'waiting_you') {
    return (
      <Link
        to={ticketPath(ticket.project, ticket.id)}
        className="relative z-10 inline-flex min-h-9 w-fit items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-sm font-medium text-fg no-underline hover:bg-hover"
      >
        Open to answer
        <ArrowRight aria-hidden="true" className="size-4" />
      </Link>
    );
  }

  return null;
}
