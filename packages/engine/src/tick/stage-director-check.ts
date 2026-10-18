/**
 * Director check stage: the Director judges finished work against its plan, from typed artifacts only.
 *
 * Why: before work reaches the owner's sign-off, someone independent of the Worker must ask "did
 *   this do what the plan said?". That is a Director step, not a Worker run: tool-less, shown the
 *   plan entry's acceptance and files, the diff, the gate and test reports and the findings so far,
 *   and never the Worker's own account (d-0141 item 9). The engine computes which changed files the
 *   plan did not name itself. A ticket with no plan entry has nothing to check against: the stage is
 *   skipped, which also means the Director may not sign it. The step runs as an in-memory job beside
 *   the tick (it can take minutes), keyed by ticket, run, stage and cycle; the stage row says
 *   `running` meanwhile, so a restart finds the row with no job and asks again. What a finished job
 *   means (a pass, a hold, a scope drift, a retry, a park) is in tick/stage-director-apply.
 *
 * Exports: startDirectorCheck(), resumeDirectorCheck(), pruneCheckJobs(), checkJobKey().
 * Depends on: @forge/core (steps, unplannedFiles), domain/director-check, steps/run-step,
 *   tick/{plan-keys,planning-state,stage-artifacts,stage-records,tick-requests}. IO: git diff, storage, the Director step.
 */

import { TicketCheckOutput, unplannedFiles } from '@forge/core';
import type { DirectorCheckStage } from '@forge/core';
import { CHECK_ARTIFACT_KINDS, buildCheckInput } from '#/domain/director-check.js';
import { runStep } from '#/steps/run-step.js';
import { planEntryOf } from '#/tick/plan-keys.js';
import { directorFor } from '#/tick/planning-state.js';
import { collectArtifacts, persistArtifacts } from '#/tick/stage-artifacts.js';
import { beginStageRun, recordStage } from '#/tick/stage-records.js';
import { requestTick } from '#/tick/tick-requests.js';
import type { EngineCtx } from '#/types/engine-state.types.js';
import type { CheckJob, StageState } from '#/types/stage-runner.types.js';
import type { VerifyTarget } from '#/types/verify.types.js';

/** The key of one Director check job: `ticket:run:stage:cycle`. */
export const checkJobKey = (
  ticketId: string,
  runId: string,
  stageId: string,
  cycle: number,
): string => `${ticketId}:${runId}:${stageId}:${cycle}`;

/**
 * Starts the Director check for the due stage: returns `skipped` when the ticket has no plan entry
 * (the stage row says so and the pipeline goes on), `started` once the step runs in the background
 * (or it already does).
 */
export async function startDirectorCheck(
  ctx: EngineCtx,
  t: VerifyTarget,
  state: StageState,
  stage: DirectorCheckStage,
): Promise<'started' | 'skipped'> {
  const { deps } = ctx;
  const key = checkJobKey(t.ticket.id, t.run.id, stage.id, state.cycle);
  if (ctx.state.checkJobs.has(key)) {
    return 'started';
  }

  const diff = await t.runtime.worktrees.diff(t.worktree, t.baseSha);
  const paths = diff.files.flatMap((f) => (f.oldPath ? [f.path, f.oldPath] : [f.path]));
  const { director } = directorFor(ctx, t.project.slug);
  const attempt = {
    ticket_id: t.ticket.id,
    stage_id: stage.id,
    member_id: '',
    cycle: state.cycle,
    kind: 'director' as const,
  };

  const prepared = await deps.storage.transaction(async (tx) => {
    const plan = await planEntryOf(tx, t.ticket);
    if (!plan) {
      await recordStage(tx, ctx.nowIso, attempt, 'skipped', {
        note: 'no plan to check against, so the Director does not check or sign this ticket',
      });

      return null;
    }

    const drafts = await collectArtifacts(tx, {
      ticket: t.ticket,
      run: t.run,
      kinds: CHECK_ARTIFACT_KINDS,
      diff: diff.patch,
    });

    const rowId = await beginStageRun(tx, ctx.nowIso, attempt);
    if (rowId !== null) {
      // What the Director was shown is kept on the row, so the owner can read it.
      await persistArtifacts(tx, t.ticket.id, rowId, drafts, ctx.nowIso);
    }

    return { plan, drafts, rowId };
  });

  if (!prepared) {
    return 'skipped';
  }

  if (prepared.rowId === null) {
    return 'started';
  }

  const unplanned = unplannedFiles(prepared.plan.entry.files, paths);
  const input = buildCheckInput({
    artifacts: prepared.drafts,
    unplanned,
    playbook: director.playbooks['check-against-plan']
      ? { id: 'check-against-plan', ...director.playbooks['check-against-plan'] }
      : null,
    houseRules: director.house_rules,
  });

  const job: CheckJob = {
    ticketId: t.ticket.id,
    stageRunId: prepared.rowId,
    unplanned,
    cost: 0,
    done: Promise.resolve(),
  };

  job.done = runStep(ctx, 'ticket_check', { ...input }, TicketCheckOutput, {
    timeoutMs: director.step_timeouts_ms.ticket_check,
    onCost: (usd) => {
      job.cost += usd;
    },
  })
    .then(
      (r) => {
        job.outcome = r.ok ? { ok: true, value: r.value } : { ok: false, error: r.error };
      },
      (e: unknown) => {
        job.outcome = {
          ok: false,
          error: { kind: 'unknown', message: e instanceof Error ? e.message : String(e) },
        };
      },
    )
    .finally(() => requestTick(deps, ctx.state));

  ctx.state.checkJobs.set(key, job);
  deps.log?.('info', `director check started for ${t.ticket.id}`, { key });

  return 'started';
}

/** Asks the step again for a check whose row says running but whose job is gone (a restart). */
export async function resumeDirectorCheck(
  ctx: EngineCtx,
  t: VerifyTarget,
  state: StageState,
  stage: DirectorCheckStage,
): Promise<void> {
  const running = state.records.some(
    (r) =>
      r.stage_id === stage.id &&
      r.member_id === '' &&
      r.cycle === state.cycle &&
      r.status === 'running',
  );

  if (
    running &&
    !ctx.state.checkJobs.has(checkJobKey(t.ticket.id, t.run.id, stage.id, state.cycle))
  ) {
    await startDirectorCheck(ctx, t, state, stage);
  }
}

/** Forgets finished Director check jobs of tickets that are no longer verifying (cancelled, merged elsewhere). */
export function pruneCheckJobs(ctx: EngineCtx, verifyingIds: ReadonlySet<string>): void {
  for (const [key, job] of ctx.state.checkJobs) {
    if (job.outcome !== undefined && !verifyingIds.has(job.ticketId)) {
      ctx.state.checkJobs.delete(key);
    }
  }
}
