/**
 * Stage outcome: what a settled stage run means for its pipeline.
 *
 * Why: a run that belonged to a pipeline stage ends in one of two roles. A writer that succeeded
 *   passes its stage, and the cursor says what is next: another writer (a `stage` wake starts it
 *   while the ticket stays In Progress), the red proof of a test-writer, or Verifying. A check
 *   (a reviewer or researcher) never moves the ticket on its own say: it reports a typed review
 *   through `submit_review`, and only findings the stage's policy calls blocking stop the merge;
 *   a run that ended without any review is an error and parks the ticket, never a pass (fail
 *   closed). Where blocking findings go (back for rework, or held for the owner) is
 *   `blockingRoute`'s call: a reviewer's findings at the rework cap hold the ticket instead of
 *   dead-ending it, and a critic set to hold holds at once. A critic that runs on the Worker's own
 *   model family is labelled on its row (d-0073). A check that failed to run is retried or parked
 *   by its error family under the same bounds as any run (a rate limit past its retries, or a model the harness
 *   cannot serve, moves the check to the next place on its agent's own list first), and an out-of-quota harness is parked
 *   until its reset. All of it is applied inside the settle transaction, through the same doors as
 *   every other ticket change.
 *
 * Exports: afterWriterSuccessTx(), applyCheckOutcome().
 * Depends on: @forge/core (stage policy, cursor, sameFamilyCritics), tick/{run-agent,stage-advance,stage-artifacts,
 *   stage-check-failure,stage-records,stage-labels,stage-send-back}. Writes inside the caller's transaction.
 */

import { blockingCount, renderBlocking, sameFamilyCritics } from '@forge/core';
import type {
  ErrorFamily,
  Run,
  RunResult,
  StageRun,
  StorageTx,
  Ticket,
  TicketPipeline,
} from '@forge/core';
import { advanceStagesTx } from '#/tick/stage-advance.js';
import {
  collectArtifacts,
  persistArtifacts,
  pipelineHasChecks,
} from '#/tick/stage-artifacts.js';
import { checkNotCompleted } from '#/tick/stage-check-failure.js';
import { finishStageRun } from '#/tick/stage-records.js';
import { labelOf, policyOf } from '#/tick/stage-labels.js';
import { routeBlockedTx } from '#/tick/stage-send-back.js';
import { agentViews } from '#/tick/run-agent.js';
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

/** True when the check of `row` is a critic on the Worker's own model family (the strip labels it, d-0073). */
async function isSameFamilyCritic(
  ctx: EngineCtx,
  tx: StorageTx,
  ticket: Ticket,
  snapshot: TicketPipeline,
  row: StageRun,
): Promise<boolean> {
  const slug = (await tx.projects.get(ticket.project))?.slug ?? ticket.project;
  const critics = sameFamilyCritics(snapshot.definition, agentViews(ctx.config, slug));

  return critics.some(
    (s) => s.id === (row.member_id === '' ? row.stage_id : row.member_id),
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
  const outcome = {
    review,
    blocking,
    ...((await isSameFamilyCritic(ctx, tx, ticket, snapshot, row))
      ? { same_family: true as const }
      : {}),
  };

  if (blocking === 0 || ticket.status !== 'verifying') {
    // A late result for work that already went back is kept as a record, nothing more. When the
    // ticket is held for the owner, a blocking late result waits with the hold (so the owner's
    // decision covers it) instead of ending the cycle behind the owner's back.
    const held = ticket.status === 'waiting_human' && ticket.parked_from === 'verifying';
    await finishStageRun(
      tx,
      row.id,
      blocking === 0 ? 'passed' : held ? 'waiting' : 'failed',
      outcome,
      ctx.nowIso,
    );

    return;
  }

  await routeBlockedTx(
    ctx,
    tx,
    { ticket, run: writer },
    {
      stage: { id: row.stage_id, member: row.member_id, kind: 'agent' as const },
      klass: 'check',
      policy: policy.on_blocking,
      blocking: review.findings.filter((f) => policy.blocking.includes(f.severity)),
      label,
      findings: renderBlocking(label, review, policy),
      outcome,
      rowId: row.id,
      agent: { id: row.agent_id ?? '', hash: row.agent_hash },
    },
  );
}
