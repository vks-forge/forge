/**
 * Invariant sweep: reads the open assigned tickets and reports what nothing explains.
 *
 * Why: the pure check (`findViolations`) needs a snapshot of tickets, active runs, pending
 *   interactions and pending wakes. This reads it once per tick, at the end, after every
 *   phase has had its chance to act, and puts what it finds in the tick report and the log
 *   at error level. It never repairs or retries: a ticket the engine cannot explain is a
 *   bug or a lost write, and a human should see it (director-core.md §3).
 *
 * Exports: checkInvariants().
 * Depends on: domain/invariants, shared/time, @forge/core (isRunActive).
 */

import { findViolations } from '#/domain/invariants.js';
import { FAR_FUTURE } from '#/shared/time.js';
import type { EngineCtx } from '#/types/engine-state.types.js';

/** Appends violations to the report and logs each as an error. */
export async function checkInvariants(ctx: EngineCtx): Promise<void> {
  const snapshot = await ctx.deps.storage.transaction(async (tx) => {
    const tickets = [
      ...(await tx.tickets.listByStatus('in_progress')),
      ...(await tx.tickets.listByStatus('waiting_human')),
    ];
    const runs = new Map(
      (await tx.runs.listByStatus(['starting', 'running'])).map((r) => [r.id, r]),
    );
    const pending = await tx.interactions.listPending();
    const wakes = await tx.wakeRequests.listDue(FAR_FUTURE);
    return {
      tickets,
      runs,
      pendingInteractionTickets: new Set(pending.map((i) => i.ticket_id)),
      wakeTickets: new Set(wakes.map((w) => w.ticket_id)),
    };
  });
  for (const v of findViolations(snapshot)) {
    ctx.report.violations.push(v);
    ctx.deps.log?.('error', `invariant violated: ${v.message}`, {
      ticket: v.ticketId,
      rule: v.rule,
    });
  }
}
