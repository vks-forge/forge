/**
 * ReviewTab: what the owner judges when a ticket waits on review or sign-off.
 *
 * Why: merging is the one step Forge cannot take back, so the evidence gets its own room. The
 *   decision itself (Merge anyway, Approve and merge, Sign off and merge, send back, cancel) is in
 *   the needs-you dock above the message box, where every other waiting item is, so the same
 *   buttons are never drawn twice (when the chat is not beside this view, in the tabbed and sheet
 *   layouts, the same dock is drawn at the top of this view so the decision is next to its
 *   evidence). This view shows what that decision rests on: the gates the
 *   commit passed, what will be merged (files and lines changed, the commit the gates judged,
 *   the G1 report, the pull request) and what the independent checks found, finding by finding.
 *   It exists only while the ticket waits on that decision; once merged or sent back it
 *   disappears and its URL falls back to the conversation.
 *
 * Exports: ReviewTab.
 * Depends on: routes/ticket/*, schemas/tickets (type).
 */

import type { ReactNode } from 'react';
import { ReviewFacts } from '#/routes/ticket/review-facts.js';
import { ReviewFindings } from '#/routes/ticket/review-findings.js';
import { GateStrip } from '#/routes/ticket/ticket-side.js';
import type { TicketDetail } from '#/schemas/tickets.js';

export function ReviewTab(props: {
  detail: TicketDetail;
  /** The decision, drawn first when the chat (and its dock) is not on screen beside this view. */
  decision?: ReactNode;
}) {
  const { detail } = props;

  return (
    <div className="mx-auto grid min-w-0 max-w-3xl gap-6">
      {props.decision}
      <GateStrip results={detail.gate_results} />
      <ReviewFindings ticketId={detail.ticket.id} />
      <ReviewFacts detail={detail} />
    </div>
  );
}
