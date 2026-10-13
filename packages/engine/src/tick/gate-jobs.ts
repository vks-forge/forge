/**
 * Gate jobs: run the gates beside the tick and hand the result to the next one.
 *
 * Why: the gates run the project's lint, typecheck and tests, which can take up to half an
 *   hour. If the tick awaited them, every other ticket would wait that long to be settled,
 *   steered or dispatched, and a stalled run would go unnoticed. So the verify phase starts a
 *   job and returns; the job writes only `gate_results` rows through the same code path as
 *   before and then asks for a tick, and the tick applies the outcome (rework, merge, park)
 *   through the usual CAS moves. Ticket state therefore still changes only inside a tick.
 *   One job per ticket and run: a second start is a no-op. Jobs live in memory; a restart
 *   loses them, finds no rows for the run and gates again.
 *
 * Exports: jobKey(), startGateJob(), pruneGateJobs().
 * Depends on: tick/{verify-gates,tick-requests}, types/verify. IO through the gate ports.
 */

import type { Claim } from '@forge/core';
import { runGates } from '#/tick/verify-gates.js';
import { requestTick } from '#/tick/tick-requests.js';
import type { EngineCtx } from '#/types/engine-state.types.js';
import type { GateJob, VerifyTarget } from '#/types/verify.types.js';

export const jobKey = (ticketId: string, runId: string): string => `${ticketId}:${runId}`;

/** Starts the gates on `headSha` in the background; returns the existing job if one is already tracked. */
export function startGateJob(
  ctx: EngineCtx,
  t: VerifyTarget,
  claims: readonly Claim[],
  headSha: string,
): GateJob {
  const { deps, state } = ctx;
  const key = jobKey(t.ticket.id, t.run.id);
  const existing = state.gateJobs.get(key);
  if (existing) {
    return existing;
  }

  const job: GateJob = {
    ticketId: t.ticket.id,
    runId: t.run.id,
    headSha,
    done: Promise.resolve(),
  };

  job.done = runGates(deps, t, claims, headSha)
    .then(
      (run) => {
        job.outcome = { ok: true, run };
      },
      (error: unknown) => {
        job.outcome = { ok: false, error };
      },
    )
    .finally(() => requestTick(deps, state));

  state.gateJobs.set(key, job);

  return job;
}

/** Drops finished jobs of tickets that are no longer verifying (cancelled, done elsewhere). */
export function pruneGateJobs(ctx: EngineCtx, verifyingIds: ReadonlySet<string>): void {
  for (const [key, job] of ctx.state.gateJobs) {
    if (job.outcome !== undefined && !verifyingIds.has(job.ticketId)) {
      ctx.state.gateJobs.delete(key);
    }
  }
}
