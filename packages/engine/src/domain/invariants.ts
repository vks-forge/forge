/**
 * Per-tick invariant check.
 *
 * Why: the rule that keeps the Director honest is "every open assigned ticket has a live
 *   run, a durable reason to wait, or a visible blocking status" (director-core.md §3). A
 *   ticket that breaks it is silently lost work, so the check names the offenders and
 *   returns them as data for the control room; it never repairs or retries anything.
 *
 * Exports: findViolations().
 * Depends on: types/invariants, types/engine, @forge/core (isRunActive). No IO.
 */

import { isRunActive } from '@forge/core';
import type { Violation } from '#/types/engine.types.js';
import type { InvariantInput } from '#/types/invariants.types.js';

/**
 * Open assigned tickets that nothing explains: `in_progress` and `waiting_human` only.
 * A pending wake also explains a `waiting_human` ticket: an answered question waits for
 * its response wake to be dispatched.
 */
export function findViolations(input: InvariantInput): Violation[] {
  const out: Violation[] = [];
  for (const t of input.tickets) {
    if (t.status === 'in_progress') {
      const run =
        t.assignee_run_id === undefined ? undefined : input.runs.get(t.assignee_run_id);

      const live = run !== undefined && isRunActive(run);
      if (
        !live &&
        !input.pendingInteractionTickets.has(t.id) &&
        !input.wakeTickets.has(t.id)
      ) {
        out.push({
          ticketId: t.id,
          rule: 'in_progress_without_reason_to_wait',
          message: `${t.id} is in_progress with no active run, pending interaction or pending wake`,
        });
      }
    } else if (t.status === 'waiting_human') {
      const explained =
        input.pendingInteractionTickets.has(t.id) ||
        input.wakeTickets.has(t.id) ||
        (t.blocked_reason !== undefined && t.blocked_reason !== '');

      if (!explained) {
        out.push({
          ticketId: t.id,
          rule: 'waiting_human_without_reason',
          message: `${t.id} is waiting_human with no pending interaction or blocked_reason`,
        });
      }
    }
  }

  return out;
}
