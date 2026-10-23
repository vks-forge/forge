/**
 * Director check, applied: what a finished check means for its stage and its ticket.
 *
 * Why: the Director's answer is not taken at its word. An unmet criterion becomes a high finding and
 *   an unclear one a medium finding, so a check that cannot tell can still block under the stage's
 *   policy; blocking findings take the road `blockingRoute` names (a hold for the owner by default);
 *   work that outgrew its plan (the engine found files outside the plan) holds for a `scope_drift`
 *   decision whatever the findings say; what it was shown and what it answered are stored on the stage
 *   row for the owner to read. A step that gave no answer is retried by its family under the usual
 *   bounds and then parks the ticket with a failure: it never passes. The spend counts toward the
 *   card's budget as a warning only (d-0143). Everything is written in the one transaction that closes
 *   the stage row.
 *
 * Exports: applyFinishedChecks().
 * Depends on: @forge/core (stage policy, steps), domain/{director-check,failure-policy}, steps/run-step,
 *   tick/{card-budget,escalation-finished,planning-state,stage-artifacts,stage-director-check,stage-labels,stage-records,
 *   stage-send-back,verify-outcomes}. Writes inside one transaction.
 */

import { MAX_AUTO_REWORKS, renderBlocking } from '@forge/core';
import type {
  DirectorCheckStage,
  ErrorFamily,
  StageRun,
  StepError,
  StorageTx,
  TicketCheckOutput,
} from '@forge/core';
import { synthesizeReview } from '#/domain/director-check.js';
import { decideFailure } from '#/domain/failure-policy.js';
import { hold, rejectStep } from '#/steps/run-step.js';
import { addDirectorSpend } from '#/tick/card-budget.js';
import { raiseDecisionTx } from '#/tick/escalation-finished.js';
import { directorFor } from '#/tick/planning-state.js';
import { makeDraft, persistArtifacts } from '#/tick/stage-artifacts.js';
import { checkJobKey } from '#/tick/stage-director-check.js';
import { policyOf } from '#/tick/stage-labels.js';
import { finishStageRun } from '#/tick/stage-records.js';
import { routeBlockedTx } from '#/tick/stage-send-back.js';
import { parkVerifyingTx } from '#/tick/verify-outcomes.js';
import type { EngineCtx } from '#/types/engine-state.types.js';
import type { CheckJob, StageState } from '#/types/stage-runner.types.js';
import type { VerifyTarget } from '#/types/verify.types.js';

/** A decision card carries at most this many unplanned paths. */
const MAX_CARD_UNPLANNED = 50;

/** The pass or hold of a finished check, written in `tx`. */
async function applyAnswer(
  ctx: EngineCtx,
  tx: StorageTx,
  t: VerifyTarget,
  stage: DirectorCheckStage,
  row: StageRun,
  state: StageState,
  job: CheckJob,
  value: TicketCheckOutput,
): Promise<void> {
  const synth = synthesizeReview(value, job.unplanned);
  const policy = policyOf(state.snapshot, row);
  const blocking = synth.review.findings.filter((f) =>
    policy.blocking.includes(f.severity),
  );

  const outcome = {
    check: value,
    review: synth.review,
    blocking: blocking.length,
    ...(job.unplanned.length > 0 ? { unplanned: job.unplanned } : {}),
  };

  await persistArtifacts(
    tx,
    t.ticket.id,
    row.id,
    [
      makeDraft(
        'check_report',
        JSON.stringify({ ...value, unplanned: job.unplanned }, null, 2),
      ),
    ],
    ctx.nowIso,
  );

  const target = { ticket: t.ticket, run: t.run };
  if (synth.scopeDrift) {
    await raiseDecisionTx(
      ctx,
      tx,
      target,
      {
        kind: 'decision',
        cause: 'scope_drift',
        summary: `${stage.label}: the change is bigger than planned (${job.unplanned.length} file(s) outside the plan). ${value.summary}`,
        stage_id: stage.id,
        stage_label: stage.label,
        findings: blocking.slice(0, 20),
        unplanned: job.unplanned.slice(0, MAX_CARD_UNPLANNED),
        rework: { count: t.ticket.rework_count, cap: MAX_AUTO_REWORKS },
      },
      [],
      (inner) => finishStageRun(inner, row.id, 'waiting', outcome, ctx.nowIso),
    );

    return;
  }

  if (blocking.length === 0) {
    await finishStageRun(tx, row.id, 'passed', outcome, ctx.nowIso);

    return;
  }

  await routeBlockedTx(ctx, tx, target, {
    stage: { id: stage.id, member: '', kind: 'director' },
    klass: 'director_check',
    policy: policy.on_blocking,
    blocking,
    label: stage.label,
    findings: renderBlocking(stage.label, synth.review, policy),
    outcome,
    rowId: row.id,
  });
}

/** A step that gave no answer: retried by its family under the usual bounds, then parked. Never a pass. */
async function applyError(
  ctx: EngineCtx,
  tx: StorageTx,
  t: VerifyTarget,
  row: StageRun,
  error: StepError,
): Promise<void> {
  const attempts = (row.outcome.attempts ?? 0) + 1;
  const family: ErrorFamily = error.kind === 'invalid_output' ? 'unknown' : error.kind;
  await finishStageRun(
    tx,
    row.id,
    'error',
    { note: error.message.slice(0, 1000), attempts: Math.min(attempts, 20) },
    ctx.nowIso,
  );

  const decision = decideFailure({
    status: 'error',
    family,
    attempts,
    ...(error.retryNotBefore ? { retryNotBefore: error.retryNotBefore } : {}),
    now: ctx.now,
    policy: ctx.config.forge.engine.retry,
  });

  if (decision.action === 'park') {
    await parkVerifyingTx(
      ctx,
      tx,
      t,
      `the Director check could not finish: ${error.message.slice(0, 300)} (${decision.reason}); needs you`,
      [],
      family,
    );

    return;
  }

  hold(ctx, `verify:${t.ticket.id}`, decision.notBefore);
}

/** Applies every Director check of this ticket that finished since the last tick; true when one was applied. */
export async function applyFinishedChecks(
  ctx: EngineCtx,
  t: VerifyTarget,
  state: StageState,
): Promise<boolean> {
  let applied = false;
  for (const stage of state.snapshot.definition.stages) {
    if (stage.kind !== 'director_check') {
      continue;
    }

    const row = state.records.find(
      (r) =>
        r.stage_id === stage.id &&
        r.member_id === '' &&
        r.cycle === state.cycle &&
        r.status === 'running',
    );

    const key = checkJobKey(t.ticket.id, t.run.id, stage.id, state.cycle);
    const job = row ? ctx.state.checkJobs.get(key) : undefined;
    if (!row || !job?.outcome) {
      continue;
    }

    ctx.state.checkJobs.delete(key);
    const { outcome } = job;
    const { director } = directorFor(ctx, t.project.slug);
    if (!outcome.ok) {
      rejectStep(ctx, 'ticket_check', t.ticket.id, outcome.error);
    }

    await ctx.deps.storage.transaction(async (tx) => {
      await addDirectorSpend(
        tx,
        t.ticket.card_id,
        job.cost,
        ctx.nowIso,
        director.budget_warning_usd,
        { kind: 'stage_check', ticketId: t.ticket.id },
      );

      if (outcome.ok) {
        await applyAnswer(ctx, tx, t, stage, row, state, job, outcome.value);
      } else {
        await applyError(ctx, tx, t, row, outcome.error);
      }
    });

    applied = true;
  }

  return applied;
}
