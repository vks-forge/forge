/**
 * Wake candidates: turns a due wake into a ticket to start, or consumes it as stale.
 *
 * Why: a wake is the engine's promise to look at a ticket again (a retry after a failure,
 *   a resume after a human's answer, a rework after a failed gate). By the time it is due the
 *   world may have moved on, and acting on a stale wake would start a second run on a ticket
 *   that is finished, cancelled, or already running. Each wake is therefore checked against
 *   the ticket as it is now: one the engine should act on becomes a candidate; one it should
 *   not is consumed and dropped, never left to fire later. A read-only caller (the ticket
 *   page's wait explanation) asks for the same verdict without consuming anything.
 *
 *   A `stage` wake starts the next stage of the ticket's pipeline. It is acted on only when the
 *   rows say that stage is ready (a writer while the ticket is in progress, a check while it is
 *   verifying); until then it waits, never dropped, because the red proof of a test-writer runs
 *   between the writer and the next stage and the wake is what keeps the ticket explained.
 *
 * Exports: classifyWake(), wakeIsDue().
 * Depends on: @forge/core (TERMINAL_STATUSES), tick/stage-state, types/engine-state, types/tick. IO only through the open transaction.
 */

import { TERMINAL_STATUSES } from '@forge/core';
import type { StorageTx, Ticket, TicketId, WakeRequest } from '@forge/core';
import { readStageState } from '#/tick/stage-state.js';
import type { Candidate, WakeView } from '#/types/tick.types.js';

export const wakeIsDue = (w: WakeRequest, now: number): boolean =>
  w.not_before === undefined || Date.parse(w.not_before) <= now;

/** A stage wake's candidate: only when the rows say its stage is ready; otherwise it keeps waiting. */
async function stageCandidate(
  view: WakeView,
  tx: StorageTx,
  ticket: Ticket,
  w: WakeRequest,
  drop: (why: string) => Promise<null>,
): Promise<Candidate | null> {
  if (ticket.status !== 'in_progress' && ticket.status !== 'verifying') {
    return drop(`stage wake does not apply to a ${ticket.status} ticket`);
  }

  if (
    ticket.status === 'in_progress' &&
    ticket.assignee_run_id &&
    view.state.pumps.has(ticket.assignee_run_id)
  ) {
    return null;
  }

  const state = await readStageState(tx, ticket.id);
  const ready = ticket.status === 'in_progress' ? 'run_writer' : 'run_checks';

  return state?.cursor.kind === ready ? { ticket, kind: 'stage', wake: w } : null;
}

/**
 * The candidate behind a due wake, or null when the wake is stale. With `consume`, a stale
 * wake is marked consumed in `tx`; without it nothing is written.
 */
export async function classifyWake(
  view: WakeView,
  tx: StorageTx,
  w: WakeRequest,
  consume: boolean,
): Promise<Candidate | null> {
  const ticket = await tx.tickets.get(w.ticket_id as TicketId);
  const drop = async (why: string): Promise<null> => {
    if (consume) {
      await tx.wakeRequests.markConsumed(w.id, view.nowIso);
      view.deps.log?.('info', `wake ${w.id} dropped: ${why}`, { ticket: w.ticket_id });
    }

    return null;
  };

  if (!ticket) {
    return drop('unknown ticket');
  }

  if (TERMINAL_STATUSES.includes(ticket.status)) {
    return drop(`ticket is ${ticket.status}`);
  }

  const assigned = ticket.assignee_run_id
    ? await tx.runs.get(ticket.assignee_run_id)
    : null;

  // A continuation wake is the rework request after a failed gate, and a stage wake the start
  // of the next stage: the run each follows did report done, which is exactly why they exist.
  if (assigned?.status === 'success' && w.kind !== 'continuation' && w.kind !== 'stage') {
    return drop('its run already reported done');
  }

  if (w.kind === 'stage') {
    return stageCandidate(view, tx, ticket, w, drop);
  }

  if (ticket.assignee_run_id && view.state.pumps.has(ticket.assignee_run_id)) {
    return drop('a run is live');
  }

  if (
    (w.kind === 'retry' || w.kind === 'continuation') &&
    (ticket.status === 'planned' || ticket.status === 'in_progress')
  ) {
    return { ticket, kind: 'retry', wake: w };
  }

  if (w.kind === 'response_wake' && ticket.status === 'waiting_human') {
    return { ticket, kind: 'resume', wake: w };
  }

  return drop(`${w.kind} wake does not apply to a ${ticket.status} ticket`);
}
