/**
 * Settle guard for tool approvals: a run never ends `success` with a call outstanding.
 *
 * Why: the hook tells a Worker its call was not run and that it should end its turn. Some
 *   Workers do exactly that and report done; others carry on and finish anyway. Either way the
 *   work is not finished while the owner has not answered, and moving the ticket to Verifying
 *   (or advancing its pipeline stage) would judge code that is missing the very call the owner
 *   was asked about. So when a run that raised approvals settles as success or paused, it is
 *   turned into a pause on its oldest unanswered item: the ticket parks in Needs you and the
 *   same session resumes when the last item is answered. If the owner was faster than the run's
 *   end, nothing is waiting on them but the run is still owed its answers, so it parks and the
 *   wake is queued in the same transaction. A run that failed has no session to resume with an
 *   answer, so its open items are cancelled (the retry asks again if it needs to).
 *
 * Exports: guardApprovals().
 * Depends on: @forge/core (RunResult, Run, StorageTx), tick/{approval-wake,escalation-settle,wakes}. Writes inside the caller's transaction.
 */

import type { Run, RunResult, StorageTx } from '@forge/core';
import { pendingApprovalsOfRun, permWakeKey } from '#/tick/approval-wake.js';
import { cancelLeftovers } from '#/tick/escalation-settle.js';
import { requestWakeTx } from '#/tick/wakes.js';
import type { EngineCtx } from '#/types/engine-state.types.js';

const pausedOn = (result: RunResult, interactionId: string): RunResult => ({
  ...result,
  status: 'paused',
  pauseReason: 'interaction',
  interactionId,
});

/**
 * The result the run settles with: unchanged when it raised no approval, a pause when it did and
 * ended success or paused, unchanged (with its open items cancelled) when it failed.
 */
export async function guardApprovals(
  ctx: EngineCtx,
  tx: StorageTx,
  run: Run,
  result: RunResult,
): Promise<RunResult> {
  const own = (await tx.interactions.listByTicket(run.ticket_id)).filter(
    (i) => i.kind === 'permission' && i.run_id === run.id,
  );

  if (own.length === 0) {
    return result;
  }

  if (result.status !== 'success' && result.status !== 'paused') {
    await cancelLeftovers(
      tx,
      ctx.nowIso,
      run.ticket_id,
      `run ${run.id} ended before the owner answered`,
      (i) => i.kind === 'permission' && i.run_id === run.id,
    );

    return result;
  }

  const [oldestPending] = await pendingApprovalsOfRun(tx, run.ticket_id, run.id);
  if (oldestPending) {
    return pausedOn(result, oldestPending.id);
  }

  // Every item is answered already: the answers go to the Worker on its resume, now.
  const oldest = [...own].sort((a, b) => a.asked_at.localeCompare(b.asked_at))[0];
  if (!oldest) {
    return result;
  }

  await requestWakeTx(tx, ctx.deps, {
    ticketId: run.ticket_id,
    kind: 'response_wake',
    reason: 'answered',
    key: permWakeKey(run.id),
  });

  return pausedOn(result, oldest.id);
}
