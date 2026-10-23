/**
 * Ticket rail: which side view opens by default and which waiting questions have no escalation.
 *
 * Why: from 1280 px the Worker thread is always the main column and Review, Runs and Details sit
 *   beside it, so the "Conversation" address no longer names a rail view. The rail still has to
 *   open on something useful: the review while the ticket waits on one (it is the evidence for
 *   the decision in the dock), otherwise the runs. A pending question from a server that predates
 *   escalations has no escalation card, so the dock needs to know which interactions are not
 *   covered by one and still draw them with their own answer form.
 *
 * Exports: defaultTicketRailTab(), uncoveredInteractions(), ticketHoldWithoutItem().
 * Depends on: @forge/core (types), schemas/escalation (type), types/route-tabs.types. No IO.
 */

import type { Interaction } from '@forge/core';
import type { EscalationView } from '#/schemas/escalation.js';
import type { TicketTab } from '#/types/route-tabs.types.js';

/** The rail view to show when the route is the Conversation. */
export function defaultTicketRailTab(
  hasReview: boolean,
): Exclude<TicketTab, 'conversation'> {
  return hasReview ? 'review' : 'runs';
}

/** Pending interactions that no escalation view covers (old servers): they keep the plain form. */
export function uncoveredInteractions(
  interactions: readonly Interaction[],
  escalations: readonly Pick<EscalationView, 'id'>[],
): readonly Interaction[] {
  const covered = new Set(escalations.map((item) => item.id));

  return interactions.filter((item) => !covered.has(item.id));
}

/**
 * True for a scheduler wait (not started, held for a slot or quota) that offers actions but is
 * not a dock item: nothing waits on an owner decision, yet Cancel must stay reachable.
 */
export function ticketHoldWithoutItem(input: {
  hasReview: boolean;
  ownerItems: number;
  legacyQuestions: number;
  waitActions: number;
}): boolean {
  return (
    !input.hasReview &&
    input.ownerItems === 0 &&
    input.legacyQuestions === 0 &&
    input.waitActions > 0
  );
}
