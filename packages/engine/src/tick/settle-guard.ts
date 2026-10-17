/**
 * Settle guard: one run that cannot settle must not hold up the others, or stay stuck unseen.
 *
 * Why: settling is where a finished run moves its ticket on. When one run's settle throws (a
 *   store fault, a bad row), the old loop threw out of the whole phase: every run behind it
 *   waited, the ticket stayed `in_progress` with a run stuck in `settling`, and the tick
 *   logged the same error for ever (DCP-6 and DCP-7). Each run is now settled in isolation:
 *   a throw is logged with the run id and counted, the others go on, and a run that fails
 *   `MAX_SETTLE_FAILURES` ticks in a row is closed as an error and its ticket parked with a
 *   failure escalation, so a person sees it instead of an invariant warning each tick.
 *
 * Exports: MAX_SETTLE_FAILURES, settleGuarded().
 * Depends on: @forge/core (Run), tick/outcome-escalate. Writes storage.
 */

import type { Run, TicketId } from '@forge/core';
import { parkRun } from '#/tick/outcome-escalate.js';
import type { EngineCtx } from '#/types/engine-state.types.js';

/** Consecutive failed settles after which the run is closed as an error and its ticket parked. */
export const MAX_SETTLE_FAILURES = 3;

const msg = (e: unknown): string => String(e instanceof Error ? e.message : e);

/** Closes `run` as an error and parks its ticket with a failure escalation naming why. */
async function giveUpSettling(ctx: EngineCtx, run: Run, error: unknown): Promise<void> {
  const reason = `could not settle run ${run.id} after ${MAX_SETTLE_FAILURES} attempts: ${msg(error)}`;
  await ctx.deps.storage.transaction(async (tx) => {
    await tx.runs.update(run.id, {
      status: 'error',
      ended_at: ctx.nowIso,
      error_family: 'unknown',
    });

    const ticket = await tx.tickets.get(run.ticket_id as TicketId);
    if (ticket) {
      await parkRun(ctx, tx, ticket, run, reason, 'unknown', null);
    }
  });

  ctx.state.pumps.delete(run.id);
  ctx.state.baseShas.delete(run.id);
  // Best effort and last: the fault that stopped the settle may be in this very call, and the
  // park above must not depend on it.
  await ctx.deps.storage
    .transaction((tx) => tx.runTokens.revoke(run.id, ctx.nowIso))
    .catch((e: unknown) => {
      ctx.deps.log?.('warn', `could not revoke the token of ${run.id}`, {
        error: msg(e),
      });
    });
}

/** Runs `settle` for `run`; a throw is logged and counted, never rethrown. */
export async function settleGuarded(
  ctx: EngineCtx,
  run: Run,
  settle: () => Promise<void>,
): Promise<void> {
  const { state, deps } = ctx;
  try {
    await settle();
    state.settleFailures.delete(run.id);
  } catch (e) {
    const failures = (state.settleFailures.get(run.id) ?? 0) + 1;
    state.settleFailures.set(run.id, failures);
    ctx.report.errors.push({ where: `settle ${run.id}`, message: msg(e) });
    deps.log?.('error', `settling run ${run.id} failed (${failures})`, {
      ticket: run.ticket_id,
      error: msg(e),
    });

    if (failures >= MAX_SETTLE_FAILURES) {
      state.settleFailures.delete(run.id);
      try {
        await giveUpSettling(ctx, run, e);
      } catch (inner) {
        ctx.report.errors.push({ where: `give up ${run.id}`, message: msg(inner) });
        deps.log?.('error', `could not park the unsettled run ${run.id}`, {
          error: msg(inner),
        });
      }
    }
  }
}
