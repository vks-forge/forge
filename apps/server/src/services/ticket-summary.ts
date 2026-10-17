/**
 * Builds the light `TicketSummary` a Board card (or a card's ticket list) shows.
 *
 * Why: the project ticket list and the Card page's Tickets tab must describe a ticket the
 *   same way, including `needs_you` (derived from the status so the UI cannot disagree with
 *   the state machine) and the parent `card_id`. One function keeps the two routes from
 *   drifting apart.
 *
 * Exports: summarizeTicket().
 * Depends on: @forge/core (NEEDS_YOU_STATUSES, ticket types), types/ticket-summary. No IO.
 */

import { NEEDS_YOU_STATUSES } from '@forge/core';
import type { Ticket, TicketSummary } from '@forge/core';
import type { TicketExtras } from '#/types/ticket-summary.types.js';

/** `slug` is the project slug the summary reports; `runStatus` is the persisted status of the run working the ticket, if any. */
export function summarizeTicket(
  ticket: Ticket,
  slug: string,
  runStatus: TicketSummary['run_status'],
  extras: TicketExtras = {},
): TicketSummary {
  return {
    id: ticket.id,
    title: ticket.title,
    state: ticket.status,
    lane: ticket.lane,
    type: ticket.type,
    tier_predicted: ticket.tier_predicted,
    project: slug,
    ...(ticket.card_id === undefined ? {} : { card_id: ticket.card_id }),
    priority: ticket.priority,
    rework_count: ticket.rework_count,
    needs_you: NEEDS_YOU_STATUSES.includes(ticket.status),
    ...(ticket.blocked_reason === undefined
      ? {}
      : { blocked_reason: ticket.blocked_reason }),
    ...(ticket.assignee_run_id === undefined ? {} : { run_id: ticket.assignee_run_id }),
    ...(runStatus === undefined ? {} : { run_status: runStatus }),
    ...(ticket.pr_url === undefined ? {} : { pr_url: ticket.pr_url }),
    ...(extras.cardTitle === undefined ? {} : { card_title: extras.cardTitle }),
    ...(extras.costUsd === undefined ? {} : { cost_usd: extras.costUsd }),
    created_at: ticket.created_at,
    updated_at: ticket.updated_at,
  };
}
