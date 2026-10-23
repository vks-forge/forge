/**
 * Route tabs: which tab a URL names, and which tabs a ticket offers.
 *
 * Why: the tab is the last path segment of the Card and Ticket pages. A link may carry a tab
 *   this page does not know (a typo, an old bookmark, `/review` on a ticket that no longer
 *   waits on review), and the page must land on its default tab instead of an empty panel.
 *   The Review tab exists only while the ticket waits on the owner's review or sign-off or is held
 *   for their decision, so that rule lives here, once, for the tab strip and the redirect to agree.
 *
 * Exports: CARD_TAB_IDS, TICKET_TAB_IDS, shownCardTabs(), resolveTab(), legacyCardTab(), ticketHasReview(),
 *   isReviewItem().
 * Depends on: schemas/escalation, schemas/tickets (types), types/cards-ui.types, types/route-tabs.types. No IO.
 */

import type { EscalationView } from '#/schemas/escalation.js';
import type { TicketDetail } from '#/schemas/tickets.js';
import type { CardTab } from '#/types/cards-ui.types.js';
import type { TicketTab } from '#/types/route-tabs.types.js';

export const CARD_TAB_IDS: readonly CardTab[] = [
  'conversation',
  'plan',
  'evidence',
  'tickets',
  'history',
  'details',
];

export const TICKET_TAB_IDS: readonly TicketTab[] = [
  'conversation',
  'review',
  'runs',
  'history',
  'details',
];

/**
 * The card tabs to show: Evidence appears once research has left something to read (a
 * fact or a finished run, even one that kept nothing), or while it is the open tab, so a
 * link to it never lands on a missing tab.
 */
export function shownCardTabs(
  research: { evidence: readonly unknown[]; runs_used: number } | undefined,
  active: CardTab,
): readonly CardTab[] {
  const researched =
    research !== undefined && (research.evidence.length > 0 || research.runs_used > 0);

  return CARD_TAB_IDS.filter((id) => id !== 'evidence' || researched || active === id);
}

/** The tab a URL segment names: `known` when it is one of `allowed`, else the default. */
export function resolveTab<T extends string>(
  segment: string | undefined,
  allowed: readonly T[],
  fallback: T,
): { tab: T; known: boolean } {
  const match = allowed.find((id) => id === segment);

  return match === undefined
    ? { tab: fallback, known: false }
    : { tab: match, known: true };
}

/** The old `?tab=` value as a card tab (`chat` was the first tab's old name), or null. */
export function legacyCardTab(value: string | null): CardTab | null {
  if (value === 'chat') {
    return 'conversation';
  }

  return CARD_TAB_IDS.find((id) => id === value) ?? null;
}

/** True while the ticket waits on the owner's review or sign-off. */
/** A held decision or a sign-off: the escalations the Review tab draws. */
export function isReviewItem(item: Pick<EscalationView, 'payload'>): boolean {
  return item.payload.kind === 'decision' || item.payload.kind === 'sign_off';
}

/**
 * Whether the Review tab exists: the ticket waits on review or sign-off, or is held for the
 * owner's decision (merge anyway, send back, continue).
 */
export function ticketHasReview(
  detail: Pick<TicketDetail, 'ticket' | 'escalations'>,
): boolean {
  const { status } = detail.ticket;

  return (
    status === 'review' ||
    status === 'needs_signoff' ||
    detail.escalations.some(
      (item) =>
        isReviewItem(item) && item.stage === 'owner' && item.settled === undefined,
    )
  );
}
