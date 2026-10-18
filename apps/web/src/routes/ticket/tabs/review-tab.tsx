/**
 * ReviewTab: what the owner judges and decides when a ticket waits on review or sign-off.
 *
 * Why: merging is the one step Forge cannot take back, so the decision gets its own room. The
 *   tab shows the gates the commit passed, then the item the owner is asked about (a held
 *   decision with its findings, or the sign-off with its tier and checks; the same card the chat
 *   and the Inbox draw, with Merge anyway, Approve and merge or Sign off and merge, send back,
 *   cancel as the server offers them), then what will be merged (files and lines changed, the
 *   commit the gates judged, the G1 report, the pull request) and what the independent checks
 *   found, finding by finding. A ticket that waits with no such item (an older one) keeps the
 *   plain wait panel. The tab exists only while the ticket waits on that decision; once merged
 *   or sent back it disappears and its URL falls back to the conversation, and the card that was
 *   just settled stays on the Conversation tab's panel as one line.
 *
 * Exports: ReviewTab.
 * Depends on: components/escalation/escalation-card, domain/route-tabs, routes/ticket/*,
 *   schemas/escalation, schemas/tickets (types).
 */

import { EscalationCard } from '#/components/escalation/escalation-card.js';
import { isReviewItem } from '#/domain/route-tabs.js';
import { ReviewFindings } from '#/routes/ticket/review-findings.js';
import { ReviewFacts } from '#/routes/ticket/review-facts.js';
import { GateStrip } from '#/routes/ticket/ticket-side.js';
import { TicketWait } from '#/routes/ticket/ticket-wait.js';
import type { EscalationView } from '#/schemas/escalation.js';
import type { TicketDetail } from '#/schemas/tickets.js';

export function ReviewTab(props: {
  detail: TicketDetail;
  escalations: readonly EscalationView[];
  onKeep: (view: EscalationView) => void;
}) {
  const { detail } = props;
  const { ticket } = detail;
  const items = props.escalations.filter(isReviewItem);

  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <GateStrip results={detail.gate_results} />
      {items.map((view) => (
        <EscalationCard
          key={view.id}
          view={view}
          showTicket={false}
          onKeep={props.onKeep}
        />
      ))}
      <ReviewFindings ticketId={ticket.id} />
      {items.length === 0 && detail.wait_actions.length > 0 ? (
        <TicketWait detail={detail} />
      ) : (
        <ReviewFacts detail={detail} />
      )}
    </div>
  );
}
