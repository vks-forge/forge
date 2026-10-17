/**
 * Route tabs: which tab a URL names, and which tabs a ticket offers.
 *
 * Why: the tab is the last path segment of the Card and Ticket pages. A link may carry a tab
 *   this page does not know (a typo, an old bookmark, `/review` on a ticket that no longer
 *   waits on review), and the page must land on its default tab instead of an empty panel.
 *   The Review tab exists only while the ticket waits on the owner's review or sign-off, so
 *   that rule lives here, once, for the tab strip and the redirect to agree.
 *
 * Exports: CARD_TAB_IDS, TICKET_TAB_IDS, resolveTab(), legacyCardTab(), ticketHasReview().
 * Depends on: @forge/core (type), types/cards-ui.types, types/route-tabs.types. No IO.
 */

import type { TicketStatus } from '@forge/core';
import type { CardTab } from '#/types/cards-ui.types.js';
import type { TicketTab } from '#/types/route-tabs.types.js';

export const CARD_TAB_IDS: readonly CardTab[] = [
  'conversation',
  'plan',
  'tickets',
  'details',
];

export const TICKET_TAB_IDS: readonly TicketTab[] = [
  'conversation',
  'review',
  'runs',
  'details',
];

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
export function ticketHasReview(status: TicketStatus): boolean {
  return status === 'review' || status === 'needs_signoff';
}
