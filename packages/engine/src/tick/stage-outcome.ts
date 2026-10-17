/**
 * Stage outcome: what a settled stage run means for its pipeline.
 *
 * Why: a run that belonged to a pipeline stage ends in one of two roles. A writer that succeeded
 *   passes its stage, and the cursor says what is next: another writer (a `stage` wake starts it
 *   while the ticket stays In Progress), the red proof of a test-writer, or Verifying. A check
 *   (a reviewer or researcher) never moves the ticket on its own say: it reports a typed review
 *   through `submit_review`, and only findings the stage's policy calls blocking stop the merge
 *   (send the Worker back, or hold for the owner); a run that ended without any review is an
 *   error and parks the ticket, never a pass (fail closed). A check that failed to run is retried
 *   or parked by its error family under the same bounds as any run, and an out-of-quota harness
 *   is parked until its reset. All of it is applied inside the settle transaction, through the
 *   same doors as every other ticket change.
 *
 * Exports: afterWriterSuccessTx(), applyCheckOutcome().
 * Depends on: @forge/core (stage policy, cursor), domain/failure-policy, tick/{quota,stage-artifacts,
 *   stage-records,stage-send-back,ticket-moves,verify-outcomes}. Writes inside the caller's transaction.
 */

import { blockingCount, renderBlocking } from '@forge/core';
import type {
  ErrorFamily,
  Run,
  RunResult,
  StageRun,
  StorageTx,
  Ticket,
  TicketPipeline,
} from '@forge/core';
import { decideFailure } from '#/domain/failure-policy.js';
import { parkHarnessForQuota } from '#/tick/quota.js';
import { advanceStagesTx } from '#/tick/stage-advance.js';
import {
  collectArtifacts,
  persistArtifacts,
  pipelineHasChecks,
} from '#/tick/stage-artifacts.js';
import { finishStageRun, requestStageWake } from '#/tick/stage-records.js';
import { labelOf, policyOf } from '#/tick/stage-labels.js';
import { holdForOwnerTx, sendBackTx } from '#/tick/stage-send-back.js';
import { parkVerifyingTx } from '#/tick/verify-outcomes.js';
import type { EngineCtx } from '#/types/engine-state.types.js';
import type { StageState } from '#/types/stage-runner.types.js';
import type { SettleOptions } from '#/types/tick.types.js';

/** A writer's stage passes; the next stage starts by a wake, or the ticket moves to Verifying. */
export async function afterWriterSuccessTx(
  ctx: EngineCtx,
  tx: StorageTx,
  ticket: Ticket,
  run: Run,
  row: StageRun,
  snapshot: TicketPipeline,
  opts: Pick<SettleOptions, 'diff'>,
): Promise<void> {
  await finishStageRun(tx, row.id, 'passed', {}, ctx.nowIso);
  if (pipelineHasChecks(snapshot)) {
    // What the writer left behind: the checks after it are shown these, and the owner can read them.
    const drafts = await collectArtifacts(tx, {
      ticket,
      run,
      kinds: ['finish_claims', 'narrative', 'diff'],
      diff: opts.diff,
    });

    await persistArtifacts(tx, ticket.id, row.id, drafts, ctx.nowIso);
  }

  await advanceStagesTx(ctx, tx, ticket, snapshot);
}

/** The last review the run submitted, or undefined. */
async function lastReview(tx: StorageTx, runId: string) {
  const events = await tx.runEvents.listByRun(runId);
  for (const e of [...events].reverse()) {
    if (e.type === 'review') {
      return e.review;
    }
  }

  return undefined;
}

/**
 * A check attempt failed to produce a verdict: no review, a crash, a quota stop. It is retried or
 * parked bounded by the family, never counted as a pass.
 */
async function checkNotCompleted(
  ctx: EngineCtx,
  tx: StorageTx,
  ticket: Ticket,
  writer: Run,
  run: Run,
  row: StageRun,
  result: RunResult,
  family: ErrorFamily | undefined,
  why: string,
): Promise<void> {
  await finishStageRun(tx, row.id, 'error', { note: why.slice(0, 1000) }, ctx.nowIso);
  if (family === 'quota') {
    const until = await parkHarnessForQuota(ctx, tx, run, result);
    await requestStageWake(
      ctx,
      tx,
      ticket.id,
      row.stage_id,
      row.cycle,
      'stage:quota',
      until,
    );

    return;
  }

  const failed = family === undefined ? [] : await tx.runs.listByTicket(ticket.id);
  const attempts = failed.filter((r) => r.error_family === family).length;
  const decision =
    family === undefined
      ? ({ action: 'park', reason: why } as const)
      : decideFailure({
          status: result.status,
          family,
          attempts: Math.max(1, attempts),
          ...(result.retryNotBefore ? { retryNotBefore: result.retryNotBefore } : {}),
          now: ctx.now,
          policy: ctx.config.forge.engine.retry,
        });

  if (decision.action === 'park') {
    await parkVerifyingTx(
      ctx,
      tx,
      { ticket, run: writer },
      `a check could not finish: ${why}; needs you`,
      [],
      family,
    );

    return;
  }

  await requestStageWake(
    ctx,
    tx,
    ticket.id,
    row.stage_id,
    row.cycle,
    `stage:retry:${decision.family}`,
    decision.notBefore,
  );
}

/**
 * Applies the end of a check run to its attempt row and the ticket. A late result for a ticket
 * that already moved on (another member sent the work back) is recorded and changes nothing else.
 */
export async function applyCheckOutcome(
  ctx: EngineCtx,
  tx: StorageTx,
  ticket: Ticket,
  run: Run,
  result: RunResult,
  family: ErrorFamily | undefined,
  row: StageRun,
  state: StageState,
): Promise<void> {
  const { snapshot } = state;
  const writer = ticket.assignee_run_id
    ? await tx.runs.get(ticket.assignee_run_id)
    : null;

  const label = labelOf(snapshot, row);
  if (!writer) {
    ctx.deps.log?.(
      'error',
      `${ticket.id}: check run ${run.id} has no writer run to judge`,
    );

    return;
  }

  if (result.status !== 'success') {
    const why =
      result.status === 'paused'
        ? 'it stopped to ask a question'
        : `its run ended as ${result.status}`;

    if (ticket.status === 'verifying') {
      await checkNotCompleted(
        ctx,
        tx,
        ticket,
        writer,
        run,
        row,
        result,
        family,
        `${label}: ${why}`,
      );
    } else {
      await finishStageRun(tx, row.id, 'error', { note: why }, ctx.nowIso);
    }

    return;
  }

  const review = await lastReview(tx, run.id);
  if (!review) {
    if (ticket.status === 'verifying') {
      await checkNotCompleted(
        ctx,
        tx,
        ticket,
        writer,
        run,
        row,
        result,
        undefined,
        `${label}: the agent finished without submitting a review`,
      );
    } else {
      await finishStageRun(
        tx,
        row.id,
        'error',
        { note: 'no review submitted' },
        ctx.nowIso,
      );
    }

    return;
  }

  const policy = policyOf(snapshot, row);
  const blocking = blockingCount(review, policy);
  const outcome = { review, blocking };
  if (blocking === 0 || ticket.status !== 'verifying') {
    // A late result for work that already went back is kept as a record, nothing more.
    await finishStageRun(
      tx,
      row.id,
      blocking === 0 ? 'passed' : 'failed',
      outcome,
      ctx.nowIso,
    );

    return;
  }

  const args = {
    stage: { id: row.stage_id, member: row.member_id, kind: 'agent' as const },
    label,
    findings: renderBlocking(label, review, policy),
    outcome,
    rowId: row.id,
    agent: { id: row.agent_id ?? '', hash: row.agent_hash },
  };

  const target = { ticket, run: writer };
  if (policy.on_blocking === 'hold') {
    await holdForOwnerTx(ctx, tx, target, args);
  } else {
    await sendBackTx(ctx, tx, target, args);
  }
}
