/**
 * ReviewTab: what the owner judges and decides when a ticket waits on review or sign-off.
 *
 * Why: merging is the one step Forge cannot take back, so the decision gets its own room. The
 *   tab shows the gates the commit passed, then what will be merged (files and lines changed,
 *   the commit the gates judged, the G1 report, the pull request) and the actions the server
 *   allows: Approve and merge (or Sign off and merge for tier C), send back for rework, cancel.
 *   It exists only while the ticket waits on that decision; once merged or sent back the tab
 *   disappears and its URL falls back to the conversation.
 *
 * Exports: ReviewTab.
 * Depends on: react, routes/ticket/*, schemas/tickets (type).
 */

import { ReviewFacts } from '#/routes/ticket/review-facts.js';
import { GateStrip } from '#/routes/ticket/ticket-side.js';
import { TicketWait } from '#/routes/ticket/ticket-wait.js';
import type { TicketDetail } from '#/schemas/tickets.js';

export function ReviewTab(props: { detail: TicketDetail }) {
  const { detail } = props;

  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <GateStrip results={detail.gate_results} />
      {detail.wait_actions.length > 0 ? (
        <TicketWait detail={detail} />
      ) : (
        <ReviewFacts detail={detail} />
      )}
    </div>
  );
}
