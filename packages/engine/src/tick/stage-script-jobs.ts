/**
 * Script jobs: run the owner's script gates and the red proof beside the tick.
 *
 * Why: a script gate runs the owner's own command (a linter, a security scan, a test suite) and
 *   can take minutes. If the tick awaited it, every other ticket would wait that long, so the
 *   stage runner starts a job and returns; the job records nothing itself but asks for a tick
 *   when it ends, and the tick that finds the result writes it to the stage row. Like gate jobs
 *   they live in memory and are keyed `ticket:run:stage:member`: the rows are the truth, so a
 *   restart finds a `running` row with no job and starts the command again. Results go to
 *   `stage_runs` only, never to `gate_results`, which stay G1's. One job per key: a second start
 *   is a no-op.
 *
 * Exports: stageJobKey(), startScriptJob(), takeFinishedJob(), hasJob(), pruneStageJobs().
 * Depends on: tick/tick-requests, types/stage-runner. IO through the runner the caller passes in.
 */

import type { GateVerdict } from '@forge/core';
import { requestTick } from '#/tick/tick-requests.js';
import type { EngineCtx } from '#/types/engine-state.types.js';
import type { StageJob, StageJobOutcome } from '#/types/stage-runner.types.js';

export const stageJobKey = (
  ticketId: string,
  runId: string,
  stageId: string,
  memberId: string,
): string => `${ticketId}:${runId}:${stageId}:${memberId}`;

/** True when a job is tracked under `key` (running or finished and not yet applied). */
export const hasJob = (ctx: EngineCtx, key: string): boolean =>
  ctx.state.stageJobs.has(key);

/** Starts `run` in the background under `key`; returns the job already tracked if there is one. */
export function startScriptJob(
  ctx: EngineCtx,
  key: string,
  meta: Pick<StageJob, 'ticketId' | 'stageRunId' | 'purpose'>,
  run: () => Promise<GateVerdict>,
): StageJob {
  const { deps, state } = ctx;
  const existing = state.stageJobs.get(key);
  if (existing) {
    return existing;
  }

  deps.log?.('info', `script job started for ${meta.ticketId}: ${meta.purpose}`, { key });
  const job: StageJob = { ...meta, done: Promise.resolve() };
  job.done = run()
    .then(
      (verdict) => {
        job.outcome = { ok: true, verdict };
      },
      (error: unknown) => {
        job.outcome = { ok: false, error };
      },
    )
    .finally(() => requestTick(deps, state));

  state.stageJobs.set(key, job);

  return job;
}

/** The outcome of the job under `key` once it is done (the job is then forgotten); null while it runs or when none is tracked. */
export function takeFinishedJob(
  ctx: EngineCtx,
  key: string,
): { job: StageJob; outcome: StageJobOutcome } | null {
  const job = ctx.state.stageJobs.get(key);
  if (!job?.outcome) {
    return null;
  }

  ctx.state.stageJobs.delete(key);

  return { job, outcome: job.outcome };
}

/** Forgets finished script gate jobs of tickets that are no longer verifying (cancelled, merged elsewhere). */
export function pruneStageJobs(ctx: EngineCtx, verifyingIds: ReadonlySet<string>): void {
  for (const [key, job] of ctx.state.stageJobs) {
    if (
      job.purpose === 'gate' &&
      job.outcome !== undefined &&
      !verifyingIds.has(job.ticketId)
    ) {
      ctx.state.stageJobs.delete(key);
    }
  }
}
