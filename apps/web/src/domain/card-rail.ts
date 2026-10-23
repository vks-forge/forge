/**
 * Card rail: which tab the side rail shows when the URL names no view.
 *
 * Why: from 1280 px the chat is always the main column and Plan, Evidence, Tickets and Details
 *   sit beside it, so the "Conversation" address no longer names a rail tab. The rail still
 *   has to open on something useful: the plan while there is one to read, otherwise the
 *   tickets while work exists, otherwise the details. An explicit tab in the URL always wins.
 *
 * Exports: defaultRailTab().
 * Depends on: types/cards-ui.types. No IO.
 */

import type { CardTab } from '#/types/cards-ui.types.js';

/** The rail tab to show when the route is the Conversation. */
export function defaultRailTab(input: {
  hasPlan: boolean;
  ticketCount: number;
}): Exclude<CardTab, 'conversation'> {
  if (input.hasPlan) {
    return 'plan';
  }

  return input.ticketCount > 0 ? 'tickets' : 'details';
}
