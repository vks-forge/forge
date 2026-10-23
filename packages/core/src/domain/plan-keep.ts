/**
 * Plan keep rule: which tickets a newly approved plan may cancel.
 *
 * Why: the Director writes a re-plan believing that tickets which started stay as they are, and
 *   the engine cancels the ones the rule calls replaceable. When "started" meant two different
 *   things (a ticket that failed and went back to planned, or one waiting on the owner, still had
 *   runs, a branch and a worktree) approval cancelled live work the plan never mentioned. This
 *   one pure rule feeds both sides: the planner is told per ticket, and approval cancels by it.
 *
 * Exports: REPLACEABLE_STATUSES, isKeptTicket(), isReplaceableTicket().
 * Depends on: schemas/ticket, types/plan-keep. No IO.
 */

import type { Ticket } from '#/schemas/ticket.js';
import type { PlanKeepFacts } from '#/types/plan-keep.types.js';

/** Statuses a ticket can have while nothing of it has started; the only ones a plan may cancel. */
export const REPLACEABLE_STATUSES: readonly Ticket['status'][] = [
  'inbox',
  'planned',
  'waiting_human',
  'blocked',
];

/**
 * True when a new plan may cancel the ticket: a waiting status, no open owner item, and no run
 * unless the owner re-planned from this very ticket. A branch or worktree alone (made by setup
 * before any Worker ran) does not mean the work started.
 */
export function isReplaceableTicket(f: PlanKeepFacts): boolean {
  return (
    REPLACEABLE_STATUSES.includes(f.status) &&
    !f.openItems &&
    (!f.hasRuns || f.replanOrigin === true)
  );
}

/** True when a new plan never cancels the ticket: finished work or work with a run. A cancelled ticket is neither kept nor replaceable. */
export function isKeptTicket(f: PlanKeepFacts): boolean {
  return f.status !== 'cancelled' && !isReplaceableTicket(f);
}
