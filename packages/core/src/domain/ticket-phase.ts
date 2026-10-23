/**
 * derivePhase — which phase a ticket is really in, from plain facts.
 *
 * Why: the board must not say "In Progress" for a ticket no Worker runs, nor "Needs you" for
 *   a ticket whose owner item is already answered. The stored status says what the state
 *   machine allows next; the phase says what is happening. One pure function with a fixed
 *   precedence keeps the board, the ticket page and the Needs-you counts in agreement.
 *
 * Precedence, first match wins: terminal status; owner waits (review, sign-off and blocked by
 *   status; a waiting ticket by its open owner items, else held by its re-planning card, else
 *   stuck); a live run; a check job; a setup job; the scheduler's wait (a slot wait of a ticket
 *   whose status says working reads `queued`); otherwise queued.
 *
 * Exports: derivePhase().
 * Depends on: domain/card-chat-actions (PLANNING_PHASES), schemas/ticket-wait, types/ticket-phase. No IO.
 */

import { PLANNING_PHASES } from '#/domain/card-chat-actions.js';
import type { SchedulerWaitKind, TicketPhase } from '#/schemas/ticket-wait.js';
import type { TicketPhaseFacts } from '#/types/ticket-phase.types.js';

const FROM_SCHEDULER: Readonly<Record<SchedulerWaitKind, TicketPhase>> = {
  deps: 'waiting_deps',
  plan: 'held_by_plan',
  prep: 'setting_up',
  quota: 'paused_quota',
  cap: 'waiting_slot',
  backoff: 'backing_off',
};

/** The phase of a ticket with these facts. */
export function derivePhase(facts: TicketPhaseFacts): TicketPhase {
  const { status } = facts;
  if (status === 'done' || status === 'cancelled') {
    return status;
  }

  if (status === 'review' || status === 'needs_signoff' || status === 'blocked') {
    return 'waiting_you';
  }

  if (status === 'waiting_human') {
    if (facts.openOwnerItems > 0) {
      return 'waiting_you';
    }

    return facts.cardPhase !== undefined && PLANNING_PHASES.includes(facts.cardPhase)
      ? 'held_by_plan'
      : 'stuck';
  }

  if (facts.liveRun) {
    return 'working';
  }

  if (facts.checkJob) {
    return 'checking';
  }

  if (facts.setupJob) {
    return 'setting_up';
  }

  if (facts.schedulerWait === undefined) {
    return 'queued';
  }

  // A ticket whose status already says "working" (a reworked one) waits for a slot as `queued`:
  // it is not a new ticket in Planned, and the board must not call it In Progress.
  const working = status === 'in_progress' || status === 'verifying';

  return working && facts.schedulerWait === 'cap'
    ? 'queued'
    : FROM_SCHEDULER[facts.schedulerWait];
}
