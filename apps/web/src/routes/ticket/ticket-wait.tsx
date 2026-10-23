/**
 * TicketWait: what the owner can do about a ticket that waits with no question to answer.
 *
 * Why: a ticket in review or sign-off, or one held back by the scheduler (it waits for another
 *   ticket, a free slot, a harness quota), is not asking anything, but the owner must still be
 *   able to act: approve and merge a reviewed ticket (or sign off tier C), send it back for rework, or cancel something they no longer want.
 *   A wait that clears by itself says so ("it starts by itself when that clears"), so nobody
 *   thinks it is stuck, and still offers Cancel. The reason itself is the header's wait line (`wait`); this panel does not repeat it, except for the workspace step. While Forge installs the project's packages in the
 *   ticket's fresh copy the line says which step is running and for how long, as the server counts it (d-0180). The server decides which actions apply
 *   (`wait_actions`); this draws them with the same buttons and dialogs as an escalation. A ticket
 *   with nothing to do and nothing to say draws nothing.
 *
 *   `variant="plain"` draws only the actions, for the needs-you dock, whose item already says what waits.
 *   For finished work the framed panel also shows what Approve / Sign off will merge (routes/ticket/review-facts).
 *
 * Exports: TicketWait.
 * Depends on: api/use-escalations, components/escalation/escalation-actions, domain/escalation-copy,
 *   schemas/escalation (types), types/escalation-ui.types, @forge/core (type).
 */

import { Hourglass } from 'lucide-react';
import { useActOnTicketWait } from '#/api/use-escalations.js';
import { EscalationActions } from '#/components/escalation/escalation-actions.js';
import { dependentsOf, describeEscalationError } from '#/domain/escalation-copy.js';
import { ReviewFacts } from '#/routes/ticket/review-facts.js';
import type { EscalationAction } from '#/schemas/escalation.js';
import type { TicketDetail } from '#/schemas/tickets.js';
import type { EscalationControls } from '#/types/escalation-ui.types.js';

/** The sentence that says what the ticket is waiting for. */
function headline(detail: TicketDetail): string {
  const { status } = detail.ticket;

  if (status === 'review') {
    return 'This ticket is ready for your review.';
  }

  if (status === 'needs_signoff') {
    return 'This ticket needs your sign-off.';
  }

  if (detail.wait_reason !== null) {
    // The workspace line adds the step and its time ("Getting the workspace ready: <step> (0:42)").
    // Any other reason is already in the header's wait line, so it is not said twice.
    return detail.wait_reason.startsWith('Getting the workspace ready')
      ? `${detail.wait_reason}.`
      : detail.wait === null || detail.wait === undefined
        ? `This ticket has not started: ${detail.wait_reason}.`
        : 'This ticket has not started.';
  }

  return 'This ticket is waiting.';
}

export function TicketWait(props: {
  detail: TicketDetail;
  /** `plain` is the actions and error only, for a surface that already frames and titles them (the dock). */
  variant?: 'framed' | 'plain';
}) {
  const { detail } = props;
  const actions: readonly EscalationAction[] = detail.wait_actions;
  const mutation = useActOnTicketWait(detail.ticket.id, detail.ticket.card_id);

  if (actions.length === 0) {
    return null;
  }

  const controls: EscalationControls = {
    act: (body, onSuccess, onFailure) => {
      if (mutation.isPending) {
        return;
      }

      mutation.mutate(body, {
        ...(onSuccess === undefined ? {} : { onSuccess }),
        ...(onFailure === undefined ? {} : { onError: onFailure }),
      });
    },
    pending: mutation.isPending ? mutation.variables.action : null,
    error: mutation.error,
    reset: mutation.reset,
  };

  const resumes = detail.wait_reason !== null && !actions.includes('rework');
  const errorLine =
    mutation.isError && dependentsOf(mutation.error) === null ? (
      <p role="alert" className="rounded-lg bg-danger-soft p-2 text-sm">
        {describeEscalationError(mutation.error)}
      </p>
    ) : null;

  if (props.variant === 'plain') {
    return (
      <div className="grid gap-2">
        <EscalationActions
          id={detail.ticket.id}
          ticketId={detail.ticket.id}
          actions={actions}
          controls={controls}
        />
        {errorLine}
      </div>
    );
  }

  return (
    <section
      aria-label="Waiting"
      className="grid gap-3 rounded-2xl border border-line bg-surface p-4"
    >
      <p className="flex items-start gap-2 text-sm font-semibold">
        <Hourglass aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted" />
        <span className="min-w-0 break-words">{headline(detail)}</span>
      </p>
      {resumes ? (
        <p className="text-sm text-muted">It starts by itself when that clears.</p>
      ) : null}
      <ReviewFacts detail={detail} />
      <EscalationActions
        id={detail.ticket.id}
        ticketId={detail.ticket.id}
        actions={actions}
        controls={controls}
      />
      {errorLine}
    </section>
  );
}
