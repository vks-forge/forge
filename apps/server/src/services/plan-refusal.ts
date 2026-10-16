/**
 * Maps the planning doors' non-success outcomes to the HTTP errors the contract names.
 *
 * Why: the engine answers each owner action with a closed set of outcomes and never throws
 *   for a wrong phase, a stale plan or a closed question. The card page keys its behaviour on
 *   the status and code (409 stale_plan reloads the plan, 409 ticket_has_dependents names the
 *   tickets that still need the one being removed, 404 means the card went away), so every
 *   route must translate the same outcome the same way. One function holds that table.
 *
 * Exports: planRefusal(), ticketRefusal().
 * Depends on: services/http/http-errors, types/plan-refusal. No IO.
 */

import { HttpError } from '#/services/http/http-errors.js';
import type { PlanOutcome } from '#/types/plan-refusal.types.js';

const CONFLICTS: Readonly<Record<string, string>> = {
  question_not_open: 'that question is no longer open',
  phase_mismatch: 'the card is not in the phase this action needs',
  stale_plan: 'a newer plan version exists; reload before acting',
  not_plannable: 'this card type is not planned by the Director',
  not_held: 'the ticket is not waiting for a pipeline',
};

const BAD_REQUESTS: Readonly<Record<string, string>> = {
  invalid_answer: 'the answer does not fit the open question',
  invalid_comment: 'the comment is too short',
  unknown_ticket: 'the plan has no such ticket',
  invalid_order: 'the order must list each remaining ticket exactly once',
  empty_plan: 'a plan needs at least one ticket',
};

/** The `HttpError` for a card-scoped refusal: 404 `card_not_found` / `plan_not_found`, 409 and 400 per the contract. */
export function planRefusal(outcome: PlanOutcome, id: string): HttpError {
  const { status } = outcome;
  if (status === 'not_found') {
    return new HttpError(404, 'card_not_found', `no card ${id}`);
  }

  if (status === 'plan_not_found') {
    return new HttpError(404, 'plan_not_found', `card ${id} has no such plan version`);
  }

  if (status === 'ticket_has_dependents') {
    return new HttpError(
      409,
      status,
      `ticket ${outcome.key ?? ''} is needed by ${(outcome.dependents ?? []).join(', ')}`,
      { details: { key: outcome.key ?? '', dependents: outcome.dependents ?? [] } },
    );
  }

  const conflict = CONFLICTS[status];
  if (conflict) {
    return new HttpError(409, status, conflict);
  }

  const bad = BAD_REQUESTS[status];
  if (bad) {
    return new HttpError(
      400,
      status,
      outcome.reason ?? bad,
      outcome.key === undefined ? {} : { details: { key: outcome.key } },
    );
  }

  // Fail closed: an outcome this table does not know is the server's problem, never a success.
  throw new Error(`unmapped planning outcome ${status}`);
}

/** The `HttpError` for a ticket-scoped refusal (`run-as-express`): 404 `ticket_not_found`, 409 `not_held`. */
export function ticketRefusal(outcome: PlanOutcome, id: string): HttpError {
  if (outcome.status === 'not_found') {
    return new HttpError(404, 'ticket_not_found', `no ticket ${id}`);
  }

  return planRefusal(outcome, id);
}
