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
 *   The members of a parallel group each have their own wake (the member is in the wake key), so
 *   the scheduler places them one at a time. A member's wake is a candidate while that member has
 *   no row to start from (none, or an errored one), even while a sibling's run is live; once the
 *   member has started, a leftover wake for it is stale and is dropped. The member of a retry after
 *   a crash is read from the stage row of the run that crashed.
 *
 * Exports: classifyWake(), wakeIsDue().
 * Depends on: @forge/core (TERMINAL_STATUSES), tick/{stage-records,stage-state}, types/engine-state, types/tick. IO only through the open transaction.
 */

import { TERMINAL_STATUSES } from '@forge/core';
import type { StorageTx, Ticket, TicketId, WakeRequest } from '@forge/core';
import { wakeMember } from '#/tick/stage-records.js';
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

  const state = await readStageState(tx, ticket.id);
  const cursor = state?.cursor;
  const member = wakeMember(w);
  const members =
    cursor?.kind === 'run_writers' || cursor?.kind === 'run_checks'
      ? cursor.members
      : null;

  // A group member's wake: startable while that member has nothing to start from, stale after.
  if (member !== undefined) {
    return members?.some((m) => m.id === member)
      ? { ticket, kind: 'stage', wake: w, member }
      : drop(`${member} of the stage already started or the stage moved on`);
  }

  if (
    ticket.status === 'in_progress' &&
    ticket.assignee_run_id &&
    view.state.pumps.has(ticket.assignee_run_id)
  ) {
    return null;
  }

  const ready = ticket.status === 'in_progress' ? 'run_writer' : 'run_checks';

  return cursor?.kind === ready ? { ticket, kind: 'stage', wake: w } : null;
}

/** The writer-group member whose crashed run a retry wake is for, from the stage row of that run; undefined for a lone stage. */
async function memberOfRun(tx: StorageTx, runId: string): Promise<string | undefined> {
  const row = await tx.stageRuns.getByRun(runId);

  return row && row.kind === 'agent' && row.member_id !== '' ? row.member_id : undefined;
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

  if (w.kind === 'stage') {
    return stageCandidate(view, tx, ticket, w, drop);
  }

  // A retry or rework of one member of a writer group is placed on its own, beside the live runs of its siblings.
  const member =
    w.kind === 'retry' || w.kind === 'continuation'
      ? (wakeMember(w) ?? (await memberOfRun(tx, w.idempotency_key.split('~')[0] ?? '')))
      : undefined;

  if (member !== undefined && ticket.status === 'in_progress') {
    const state = await readStageState(tx, ticket.id);

    return state?.cursor.kind === 'run_writers' &&
      state.cursor.members.some((m) => m.id === member)
      ? { ticket, kind: 'retry', wake: w, member }
      : drop(`${member} of the writer group already started or the stage moved on`);
  }

  // A continuation wake is the rework request after a failed gate, and a stage wake the start
  // of the next stage: the run each follows did report done, which is exactly why they exist.
  if (assigned?.status === 'success' && w.kind !== 'continuation') {
    return drop('its run already reported done');
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
