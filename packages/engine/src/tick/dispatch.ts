/**
 * Dispatch: decides which tickets get a Worker run this tick, within the limits.
 *
 * Why: starting a run commits budget and risk, so the Director starts only what is ready
 *   and affordable. Ready means: a `planned` ticket whose blockers are done, or a ticket
 *   with a due wake (a retry after a failure, a resume after a human's answer). Limits are
 *   global run slots and a per-state cap on tickets in progress; a ticket that does not fit
 *   waits for the next tick, it is never dropped. A wake the engine should not act on is
 *   consumed and dropped, never left to fire later: a ticket whose run reported done is
 *   never re-woken, and a wake for a ticket that is terminal, elsewhere or already running
 *   is stale (director-core.md §3).
 *
 * Exports: dispatchReady().
 * Depends on: @forge/core (TERMINAL_STATUSES), domain/ticket-numbers, steps/run-step,
 *   tick/dispatch-run, shared/time.
 */

import { TERMINAL_STATUSES } from '@forge/core';
import type { StorageTx, Ticket, TicketId, WakeRequest } from '@forge/core';
import { ticketNumber } from '#/domain/ticket-numbers.js';
import { isHeld } from '#/steps/run-step.js';
import { startRun } from '#/tick/dispatch-run.js';
import { FAR_FUTURE } from '#/shared/time.js';
import type { EngineCtx } from '#/types/engine-state.types.js';
import type { Candidate, Capacity } from '#/types/tick.types.js';

const due = (w: WakeRequest, now: number): boolean =>
  w.not_before === undefined || Date.parse(w.not_before) <= now;

/** Turns a due wake into a candidate, or consumes it as stale (returns null). */
async function classify(
  ctx: EngineCtx,
  tx: StorageTx,
  w: WakeRequest,
): Promise<Candidate | null> {
  const ticket = await tx.tickets.get(w.ticket_id as TicketId);
  const drop = async (why: string): Promise<null> => {
    await tx.wakeRequests.markConsumed(w.id, ctx.nowIso);
    ctx.deps.log?.('info', `wake ${w.id} dropped: ${why}`, { ticket: w.ticket_id });

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

  // A continuation wake is the rework request after a failed gate: the run it follows
  // did report done, which is exactly why the Worker is being sent back.
  if (assigned?.status === 'success' && w.kind !== 'continuation') {
    return drop('its run already reported done');
  }

  if (ticket.assignee_run_id && ctx.state.pumps.has(ticket.assignee_run_id)) {
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

async function unblocked(tx: StorageTx, ticket: Ticket): Promise<boolean> {
  for (const id of ticket.blocked_by) {
    if ((await tx.tickets.get(id))?.status !== 'done') {
      return false;
    }
  }

  return true;
}

/** Starts runs for ready tickets until slots or limits run out. */
export async function dispatchReady(ctx: EngineCtx): Promise<void> {
  const { deps } = ctx;
  const { engine } = deps.config;
  const { candidates, capacity } = await deps.storage.transaction(async (tx) => {
    const wakes = await tx.wakeRequests.listDue(FAR_FUTURE);
    const waking = new Set(wakes.map((w) => w.ticket_id));
    const list: Candidate[] = [];
    for (const w of wakes.filter((x) => due(x, ctx.now))) {
      const c = await classify(ctx, tx, w);
      if (c) {
        list.push(c);
      }
    }

    const planned = (await tx.tickets.listByStatus('planned')).sort(
      (a, b) => ticketNumber(a.id) - ticketNumber(b.id),
    );

    for (const t of planned) {
      if (!waking.has(t.id) && (await unblocked(tx, t))) {
        list.push({ ticket: t, kind: 'new' });
      }
    }

    const active = await tx.runs.listByStatus(['starting', 'running']);
    const capacity: Capacity = {
      free: engine.global_slots - active.length,
      inProgress: (await tx.tickets.listByStatus('in_progress')).length,
      inProgressLimit:
        engine.max_concurrent_by_state.in_progress ?? Number.POSITIVE_INFINITY,
    };

    return { candidates: list, capacity };
  });

  for (const c of candidates) {
    if (capacity.free <= 0) {
      break;
    }

    const id = c.ticket.id;
    if (isHeld(ctx, `dispatch:${id}`) || isHeld(ctx, `dispatch_prompt:${id}`)) {
      continue;
    }

    const entering = c.ticket.status !== 'in_progress';
    if (entering && capacity.inProgress >= capacity.inProgressLimit) {
      continue;
    }

    capacity.free--;
    if ((await startRun(ctx, c)) && entering) {
      capacity.inProgress++;
    }
  }
}
