/**
 * Input of the plan keep rule.
 *
 * Why: whether a new plan may cancel a ticket depends on how far the ticket got, not only on
 *   its status. The facts are plain values the engine reads from storage, so the rule stays
 *   pure and the Director's input and the approval use one definition of "started".
 *
 * Exports: PlanKeepFacts.
 * Depends on: schemas/ticket. Types only.
 */

import type { TicketStatus } from '#/schemas/ticket.js';

/** What is known about a ticket when a plan is about to replace the card's earlier tickets. */
export interface PlanKeepFacts {
  readonly status: TicketStatus;
  /** The ticket has at least one run, ended or not. */
  readonly hasRuns: boolean;
  /** The ticket has an interaction still waiting for an answer. */
  readonly openItems: boolean;
  /** The owner answered a hold on this very ticket with Re-plan: they asked for it to be re-planned. */
  readonly replanOrigin?: boolean | undefined;
}
