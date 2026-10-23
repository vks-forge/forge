/**
 * Optional facts a route adds to a ticket summary from its own reads.
 *
 * Why: the ticket list and the card page both describe a ticket the same way
 *   (`summarizeTicket`), but only some callers have read the ticket's run cost or its card's
 *   title. Naming the extras keeps the summary builder pure and the callers honest about what
 *   they read.
 *
 * Exports: TicketExtras, TicketProgress.
 * Depends on: @forge/core (types). Types only.
 */

import type { TicketLiveRun, TicketStageProgress } from '@forge/core';

/** The live facts of one ticket (see services/ticket-progress); each is absent when it does not apply. */
export interface TicketProgress {
  readonly stage?: TicketStageProgress;
  readonly liveRun?: TicketLiveRun;
  /** The owner question that offers Retry. */
  readonly retryEscalationId?: string;
}

export interface TicketExtras {
  /** Stage, run in flight and Retry offer, from services/ticket-progress. */
  readonly progress?: TicketProgress;
  /** Recorded run cost of the ticket in dollars. */
  readonly costUsd?: number;
  /** Title of the ticket's card. */
  readonly cardTitle?: string;
}
