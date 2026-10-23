/**
 * Input and result of editing a ticket.
 *
 * Why: the PATCH route and the card chat both edit tickets through one engine door; the route
 *   must tell a missing ticket, a refused edit (with the rule's code) and a lost race apart
 *   without reading message text.
 *
 * Exports: EditTicketResult.
 * Depends on: @forge/core (ticket schemas, TicketEditRefusalCode). Types only.
 */

import type { Ticket, TicketEditRefusalCode } from '@forge/core';

export type EditTicketResult =
  | { readonly status: 'updated'; readonly ticket: Ticket }
  | { readonly status: 'ticket_not_found' }
  | { readonly status: 'stale' }
  | {
      readonly status: 'refused';
      readonly code: TicketEditRefusalCode;
      readonly message: string;
      readonly ids: readonly string[];
    };
