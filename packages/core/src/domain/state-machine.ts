/**
 * Ticket state machine — the single door for ticket status changes.
 *
 * Why: the Director engine, HTTP API and gates all move tickets; one pure
 *   `transition()` keeps every rule (illegal moves, automatic rework cap, tier-C named
 *   signer, CAS on status_version) in one place so no caller can skip it (code.md rule
 *   6, director-core.md §3-§4, v1-scope-review.md §4.9).
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
      if (from !== 'inbox') return err(illegal(t, e));
      return ok({
        status: 'planned',
        lane: maxLane(t.lane, e.lane),
        tier_predicted: e.tier_predicted,
      });
    case 'dispatched':
      return from === 'planned' ? ok({ status: 'in_progress' }) : err(illegal(t, e));
    case 'blocked':
      if (from !== 'in_progress' && from !== 'waiting_human') return err(illegal(t, e));
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
    case 'verifying':
      return from === 'in_progress' ? ok({ status: 'verifying' }) : err(illegal(t, e));
    case 'gate_failed':
      if (from !== 'verifying') return err(illegal(t, e));
      if (t.rework_count >= MAX_AUTO_REWORKS) {
        return ok({
          status: 'waiting_human',
          blocked_reason: `automatic rework cap (${MAX_AUTO_REWORKS}) reached; needs you`,
        });
      }
      return ok({ status: 'in_progress', rework_count: t.rework_count + 1 });
    case 'gate_passed': {
      if (from !== 'verifying') return err(illegal(t, e));
      // Tier A stays in Verifying until the merge event; B/C wait on a human.
      const status = { A: 'verifying', B: 'review', C: 'needs_signoff' } as const;
      return ok({ status: status[e.tier_actual], tier_actual: e.tier_actual });
    }
    case 'merged':
      if (from !== 'verifying') return err(illegal(t, e));
      if (t.tier_actual !== 'A') {
        return err(precondition(e, 'merge needs gate_passed at tier A'));
      }
      return ok({ status: 'done' });
    case 'done':
      if (from !== 'review' && from !== 'needs_signoff') return err(illegal(t, e));
      if (from === 'needs_signoff' && (e.signer === undefined || e.signer === '')) {
        return err(precondition(e, 'tier C needs a named signer'));
      }
      return ok({ status: 'done' });
    case 'rework':
      if (from !== 'review' && from !== 'needs_signoff') return err(illegal(t, e));
      return ok({ status: 'in_progress' });
    case 'cancelled':
      return ok({ status: 'cancelled' });
  }
}

/** The single door for ticket state (code.md rule 6). Pure; never throws; returns the next ticket with `status_version` bumped, or a {@link TransitionError}. */
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
  if (!decided.ok) return decided;

  // blocked_reason only lives while the ticket is parked; drop the stale one otherwise.
  const { blocked_reason: _stale, ...rest } = ticket;
  void _stale;
  return ok({
    ...rest,
    ...decided.value,
    status_version: ticket.status_version + 1,
    updated_at: event.at,
  });
}
