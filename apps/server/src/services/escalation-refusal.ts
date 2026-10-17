/**
 * Maps the escalation doors' non-success outcomes to the HTTP errors the contract names.
 *
 * Why: the engine answers every owner action with a closed outcome and never throws for a late
 *   click, an action that is not offered or a cancel that would strand other tickets. The screens
 *   key their behaviour on the status and code (409 `not_pending` refreshes and says who settled
 *   it, `ticket_has_dependents` offers "Cancel all" and names the tickets, `still_broken` shows
 *   what is still wrong, 400 `invalid_answer` points at the field), so both routes must translate
 *   the same outcome the same way. One function holds that table, and fails closed: an outcome it
 *   does not know is the server's problem, never a success.
 *
 * Exports: escalationRefusal().
 * Depends on: @forge/engine (ActOutcome), services/http/http-errors. No IO.
 */

import type { ActOutcome } from '@forge/engine';
import { HttpError } from '#/services/http/http-errors.js';

/** The `HttpError` for an outcome that is not `done`; `what` names the missing thing for a 404 (`interaction` or `ticket`). */
export function escalationRefusal(
  outcome: Exclude<ActOutcome, { status: 'done' }>,
  id: string,
  what: 'interaction' | 'ticket',
): HttpError {
  switch (outcome.status) {
    case 'not_found':
      return new HttpError(404, `${what}_not_found`, `no ${what} ${id}`);
    case 'not_pending':
      return new HttpError(409, 'not_pending', `${id} is no longer waiting`, {
        details: { settled: outcome.settled ?? null },
      });
    case 'action_not_offered':
      return new HttpError(409, 'action_not_offered', 'that action is not offered here');
    case 'invalid_answer':
      return new HttpError(400, 'invalid_answer', outcome.reason);
    case 'ticket_has_dependents':
      return new HttpError(
        409,
        'ticket_has_dependents',
        `${outcome.dependents.join(', ')} wait on this ticket`,
        { details: { dependents: outcome.dependents } },
      );
    case 'still_broken':
      return new HttpError(409, 'still_broken', outcome.detail, {
        details: { detail: outcome.detail },
      });
    case 'head_moved':
      return new HttpError(
        409,
        'head_moved',
        'the pull request changed after the checks passed; it is being checked again',
      );
    case 'merge_refused':
      return new HttpError(409, 'merge_refused', outcome.detail, {
        details: { detail: outcome.detail },
      });
    case 'stale':
      return new HttpError(409, 'stale', 'the ticket moved on; reload before acting');
  }
}
