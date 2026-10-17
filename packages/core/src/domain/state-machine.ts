/**
 * Ticket state machine — the single door for ticket status changes.
 *
 * Why: the Director tick, the HTTP API and the gates all move tickets, and a ticket's
 *   status decides who may act next: a Worker, a gate, a human reviewer or a named
 *   tier-C signer. If any caller could write status directly, a ticket could skip
 *   Verifying, reach Done without the sign-off its tier requires, or loop through
 *   automatic rework forever. `transition()` is the one pure function that holds those
 *   rules (legal moves, the two-rework cap that hands a failing ticket to a human, the
 *   named signer for tier C) and returns the next row with `status_version` bumped, so
 *   storage can compare-and-swap and a stale writer loses instead of double-dispatching
 *   the ticket (director-core.md §3-§4, v1-scope-review.md §4.9).
 *
 * Exports: transition(), MAX_AUTO_REWORKS.
 * Depends on: domain/lane-triage, schemas/ticket, shared/result, types/result, types/ticket-events.
 *   No IO.
 */

import { maxLane } from './lane-triage.js';
import { err, ok } from '#/shared/result.js';
import { TERMINAL_STATUSES, type Ticket } from '#/schemas/ticket.js';
import type { Result } from '#/types/result.types.js';
import type {
  TicketDelta,
  TicketEvent,
  TransitionError,
} from '#/types/ticket-events.types.js';

/** Cap on automatic Verifying -> InProgress loops (v1-scope-review.md §4.9); beyond it the ticket goes to a human. */
export const MAX_AUTO_REWORKS = 2;

const illegal = (t: Ticket, e: TicketEvent): TransitionError => ({
  kind: 'illegal_transition',
  status: t.status,
  event: e.type,
});

const precondition = (e: TicketEvent, message: string): TransitionError => ({
  kind: 'precondition',
  event: e.type,
  message,
});

// Computes the delta for an accepted event, or the reason it is rejected.
function decide(t: Ticket, e: TicketEvent): Result<TicketDelta, TransitionError> {
  const from = t.status;
  switch (e.type) {
    case 'triaged':
      if (from !== 'inbox') {
        return err(illegal(t, e));
      }

      return ok({
        status: 'planned',
        lane: maxLane(t.lane, e.lane),
        tier_predicted: e.tier_predicted,
      });
    case 'dispatched':
      return from === 'planned' ? ok({ status: 'in_progress' }) : err(illegal(t, e));
    case 'blocked':
      if (from !== 'in_progress' && from !== 'waiting_human') {
        return err(illegal(t, e));
      }

      return ok({ status: 'blocked', blocked_reason: e.reason });
    case 'unblocked':
      return from === 'blocked' ? ok({ status: 'planned' }) : err(illegal(t, e));
    case 'asked':
      return from === 'in_progress'
        ? ok({ status: 'waiting_human' })
        : err(illegal(t, e));
    case 'answered':
      return from === 'waiting_human'
        ? ok({ status: 'in_progress' })
        : err(illegal(t, e));
    case 'parked': {
      // A hold with no Worker question behind it (lane not enabled, retry caps, a verify
      // fault no retry fixes). The reason is the only thing the human sees, so a blank one
      // is refused.
      const reason = e.reason.trim();
      if (
        (from !== 'planned' && from !== 'in_progress' && from !== 'verifying') ||
        reason === ''
      ) {
        return err(illegal(t, e));
      }

      // From Verifying the work is finished and rework_count is not a failed gate, so it
      // stays; `parked_from` remembers where to resume.
      return ok({
        status: 'waiting_human',
        blocked_reason: reason,
        ...(from === 'verifying' ? { parked_from: 'verifying' as const } : {}),
      });
    }

    case 'unparked':
      if (from !== 'waiting_human') {
        return err(illegal(t, e));
      }

      // Not `answered`: that resumes a Worker run (in_progress); a parked ticket may never
      // have run, so release goes back to planned and dispatch starts from there. A ticket
      // parked from Verifying already has a finished run, so it resumes verifying (publish,
      // gates, merge) with no new Worker; its tier_actual, if any, still matches that run.
      return ok({ status: t.parked_from === 'verifying' ? 'verifying' : 'planned' });
    case 'verifying':
      // Every verify cycle needs its own gate_passed: drop the previous cycle's tier.
      return from === 'in_progress'
        ? ok({ status: 'verifying', tier_actual: undefined })
        : err(illegal(t, e));
    case 'gate_failed':
      if (from !== 'verifying') {
        return err(illegal(t, e));
      }

      if (t.rework_count >= MAX_AUTO_REWORKS) {
        return ok({
          status: 'waiting_human',
          blocked_reason: `automatic rework cap (${MAX_AUTO_REWORKS}) reached; needs you`,
          tier_actual: undefined,
        });
      }

      return ok({
        status: 'in_progress',
        rework_count: t.rework_count + 1,
        tier_actual: undefined,
      });
    case 'gate_passed': {
      if (from !== 'verifying') {
        return err(illegal(t, e));
      }

      // Tier A stays in Verifying until the merge event; B/C wait on a human.
      const status = { A: 'verifying', B: 'review', C: 'needs_signoff' } as const;

      return ok({ status: status[e.tier_actual], tier_actual: e.tier_actual });
    }

    case 'merged':
      if (from !== 'verifying') {
        return err(illegal(t, e));
      }

      if (t.tier_actual !== 'A') {
        return err(precondition(e, 'merge needs gate_passed at tier A'));
      }

      return ok({ status: 'done' });
    case 'done':
      if (from !== 'review' && from !== 'needs_signoff') {
        return err(illegal(t, e));
      }

      if (
        from === 'needs_signoff' &&
        (e.signer === undefined || e.signer.trim() === '')
      ) {
        return err(precondition(e, 'tier C needs a named signer'));
      }

      return ok({ status: 'done' });
    case 'rework':
      if (from !== 'review' && from !== 'needs_signoff') {
        return err(illegal(t, e));
      }

      return ok({ status: 'in_progress', tier_actual: undefined });
    case 'regate':
      // The PR head moved after the gates passed: the pass judged a commit that is gone, so the
      // work is judged again. Like a fresh verify cycle it drops the old tier.
      if (from !== 'review' && from !== 'needs_signoff') {
        return err(illegal(t, e));
      }

      return ok({ status: 'verifying', tier_actual: undefined });
    case 'cancelled':
      return ok({ status: 'cancelled' });
  }
}

/** The single door for ticket state: every status change goes through here so no caller can skip a gate or sign-off. Pure; never throws; returns the next ticket with `status_version` bumped, or a {@link TransitionError}. */
export function transition(
  ticket: Ticket,
  event: TicketEvent,
): Result<Ticket, TransitionError> {
  if (TERMINAL_STATUSES.includes(ticket.status)) {
    return err({ kind: 'terminal', status: ticket.status, event: event.type });
  }

  if (
    event.expected_version !== undefined &&
    event.expected_version !== ticket.status_version
  ) {
    return err({
      kind: 'stale_version',
      expected: event.expected_version,
      actual: ticket.status_version,
    });
  }

  const decided = decide(ticket, event);
  if (!decided.ok) {
    return decided;
  }

  // blocked_reason and parked_from only live while the ticket is parked. The clear is
  // explicit (present-but-undefined) so a storage patch built from the result NULLs the
  // column instead of leaving the old value behind. The delta may re-set them afterwards.
  return ok({
    ...ticket,
    blocked_reason: undefined,
    parked_from: undefined,
    ...decided.value,
    status_version: ticket.status_version + 1,
    updated_at: event.at,
  });
}
