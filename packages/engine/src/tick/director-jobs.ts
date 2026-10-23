/**
 * Director jobs: run Director steps beside the tick and hand the result to the next one.
 *
 * Why: a planning turn is several slow model calls. Awaited inside the tick, one card's survey
 *   kept every other ticket from settling, being stall-checked or starting its Worker. So the
 *   tick starts a job and returns; the job runs the work with its own context and its own report,
 *   asks for a tick when it ends, and the next tick collects it (its report joins that tick's, so
 *   a rejected step is not lost after the tick that started it has returned). A key says what a
 *   job works on, `card:<id>` or `ticket:<id>`, and only one job per key may be tracked, so a card
 *   has one writer at a time. One count of free slots, `max_concurrent_steps` from the Director
 *   settings (d-0150), bounds the model calls at once, so several cards planning cannot flood the
 *   subscription. A job's clock is read when it starts and again after each model call
 *   (`liveCtx`), because a stamp frozen at tick start would be minutes old by the time a slow
 *   step writes. Jobs live in memory: a restart loses them and the stored debt (the card reply
 *   queue, the ticket's own state) starts them again.
 *
 *   A ticket step does not write ticket state itself: its body returns an `apply`, and the tick that
 *   collects the job runs it (the gate-job pattern), so ticket state still moves only in the tick.
 *   A brief (the work before a Worker run) is a job too but holds no Director slot.
 *
 * Exports: cardKey(), ticketKey(), directorSlots(), startDirectorJob(), startTicketStep(),
 *   collectDirectorJobs(), directorJobsInFlight(), cardsInFlight(), directorIdle(), liveCtx(), jobCtx().
 * Depends on: tick/{tick-report,tick-requests}, shared/time, types/director-jobs. No IO of its own.
 */

import { iso } from '#/shared/time.js';
import { absorbReport, emptyReport } from '#/tick/tick-report.js';
import { requestTick } from '#/tick/tick-requests.js';
import type {
  DirectorApply,
  DirectorJob,
  DirectorJobKey,
  DirectorJobSpec,
} from '#/types/director-jobs.types.js';
import type { EngineCtx, EngineState } from '#/types/engine-state.types.js';

export const cardKey = (cardId: string): DirectorJobKey => `card:${cardId}`;
export const ticketKey = (ticketId: string): DirectorJobKey => `ticket:${ticketId}`;

/** `ctx` with the clock read now: the stamp for a write made after a model call. */
export function liveCtx(ctx: EngineCtx): EngineCtx {
  const now = ctx.deps.clock.now();

  return { ...ctx, now, nowIso: iso(now) };
}

/** A context for a job: the clock now, and a report of its own that `collectDirectorJobs` merges later. */
export function jobCtx(ctx: EngineCtx): EngineCtx {
  const live = liveCtx(ctx);

  return { ...live, report: emptyReport(live.nowIso, false) };
}

const running = (job: DirectorJob): boolean => job.outcome === undefined;

/** Jobs the engine still tracks: executing now, or finished and waiting for the next tick to collect them. */
export function directorJobsInFlight(state: EngineState): number {
  return state.directorJobs.size;
}

/** Director slots still free: the setting minus the steps executing now (a finished job holds none, a brief never does). */
export function directorSlots(ctx: EngineCtx): number {
  const executing = [...ctx.state.directorJobs.values()].filter(
    (j) => running(j) && j.kind !== 'brief',
  ).length;

  return Math.max(0, ctx.config.forge.director.max_concurrent_steps - executing);
}

/** Cards that have a job tracked; their queued turns wait for it. */
export function cardsInFlight(state: EngineState): string[] {
  return [...state.directorJobs.values()]
    .filter((j) => j.kind === 'card_turn')
    .map((j) => j.subject);
}

/**
 * Starts a job and returns at once; null when the key already has one (finished or not), so
 * the caller leaves the work for a later tick. The caller checks `directorSlots` first.
 */
export function startDirectorJob(
  ctx: EngineCtx,
  spec: DirectorJobSpec,
): DirectorJob | null {
  const { deps, state } = ctx;
  if (state.directorJobs.has(spec.key)) {
    return null;
  }

  const inner = jobCtx(ctx);
  const job: DirectorJob = {
    key: spec.key,
    kind: spec.kind,
    subject: spec.subject,
    startedAt: inner.now,
    report: inner.report,
    done: Promise.resolve(),
  };

  job.done = spec
    .run(inner)
    .then(
      (apply) => {
        if (typeof apply === 'function') {
          job.apply = apply;
        }

        job.outcome = { ok: true };
      },
      (error: unknown) => {
        job.outcome = { ok: false, error };
        const message = error instanceof Error ? error.message : String(error);
        inner.report.errors.push({ where: spec.key, message });
        deps.log?.('error', `${spec.key} failed`, { error: message });
      },
    )
    .finally(() => requestTick(deps, state));

  state.directorJobs.set(spec.key, job);

  return job;
}

/**
 * Starts a step about one ticket when a Director slot is free and the ticket has no job tracked;
 * false otherwise, and the caller leaves the work for a later tick. `run` returns the write to apply.
 */
export function startTicketStep(
  ctx: EngineCtx,
  ticketId: string,
  run: (jobCtx: EngineCtx) => Promise<void | DirectorApply>,
): boolean {
  if (directorSlots(ctx) === 0 || ctx.state.directorJobs.has(ticketKey(ticketId))) {
    return false;
  }

  return (
    startDirectorJob(ctx, {
      key: ticketKey(ticketId),
      kind: 'ticket_step',
      subject: ticketId,
      run,
    }) !== null
  );
}

/**
 * Merges the reports of finished jobs into this tick's, frees their keys, and runs the writes the
 * ticket steps decided on. An apply that throws is reported and does not stop the others.
 */
export async function collectDirectorJobs(ctx: EngineCtx): Promise<void> {
  for (const [key, job] of ctx.state.directorJobs) {
    if (running(job)) {
      continue;
    }

    absorbReport(ctx.report, job.report);
    ctx.state.directorJobs.delete(key);
    if (!job.apply) {
      continue;
    }

    try {
      await job.apply(ctx);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      ctx.report.errors.push({ where: `${key} apply`, message });
      ctx.deps.log?.('error', `${key} apply failed`, { error: message });
    }
  }
}

/** Resolves once no Director job is executing (shutdown and tests wait on this). */
export async function directorIdle(state: EngineState): Promise<void> {
  for (;;) {
    const live = [...state.directorJobs.values()].filter(running);
    if (live.length === 0) {
      return;
    }

    await Promise.allSettled(live.map((j) => j.done));
  }
}
