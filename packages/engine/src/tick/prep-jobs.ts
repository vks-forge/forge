/**
 * Prep jobs: get a ticket's worktree ready (install its packages) beside the tick.
 *
 * Why: Workers may not install packages, so before a Worker starts, or a reviewer reads the
 *   tree, Forge runs the project's setup steps itself (d-0180). An install takes seconds to
 *   minutes; if the tick awaited it, every other ticket would wait too. So the first dispatch of
 *   a ticket starts a job and gives it a moment (a warm tree answers at once, no tick lost);
 *   a slow one returns `pending`, the ticket keeps its Worker slot (tick/schedule counts the job)
 *   and shows "Getting the workspace ready", and the tick the job asks for finds the outcome.
 *   A failed step is the owner's to fix (the ticket parks, tick/dispatch-park); an unexpected fault
 *   rethrows into dispatch's own hold; one that fails only after the Worker edited a lockfile lets the
 *   Worker start, since the broken change is its own to fix (the gates send it back until it does). The job also records the worktree folder on the ticket, so
 *   a ticket cancelled mid-install still has a folder to clean. A project with no setup steps (nothing detected,
 *   none configured) has an empty plan and starts at once with no job and no record (d-0176).
 *   Jobs live in memory: a restart loses them and the next dispatch reads the worktree's own record
 *   and prepares again only if it is not current.
 *
 * Exports: PREP_GRACE_MS, ensurePrepared(), prepPaths(), prunePrepJobs().
 * Depends on: @forge/core (PrepFailure, WorktreePreparer, Worktree), tick/{card-log,ticket-moves,tick-requests},
 *   types/{engine-state,prep-jobs,verify}. IO through the preparer and storage.
 */

import { TERMINAL_STATUSES } from '@forge/core';
import type { PrepFailure, PrepPlan, Ticket, TicketId, Worktree } from '@forge/core';
import { ENGINE_ACTOR, logCardEvent } from '#/tick/card-log.js';
import { requestTick } from '#/tick/tick-requests.js';
import { moveTicket } from '#/tick/ticket-moves.js';
import type { EngineCtx } from '#/types/engine-state.types.js';
import type { PrepJob, PrepState } from '#/types/prep-jobs.types.js';
import type { ProjectRuntime } from '#/types/verify.types.js';

/** How long a dispatch waits for a fresh job before leaving it to a later tick (a warm tree answers well within it). */
export const PREP_GRACE_MS = 200;

const SECOND_MS = 1000;

function startJob(
  ctx: EngineCtx,
  prepare: NonNullable<ProjectRuntime['prepare']>,
  ticketId: string,
  wt: Worktree,
  plan: PrepPlan,
): PrepJob {
  const { deps, state } = ctx;
  const job: PrepJob = {
    ticketId,
    worktree: wt.path,
    startedAt: deps.clock.now(),
    step: plan.steps[0]?.name ?? '',
    done: Promise.resolve(),
  };

  job.done = prepare
    .prepare(wt.path, plan, {
      baseSha: wt.baseSha,
      onStep: (name) => {
        job.step = name;
      },
    })
    .then(
      (outcome) => {
        job.outcome = { ok: true, outcome };
      },
      (error: unknown) => {
        job.outcome = { ok: false, error };
      },
    )
    .finally(() => requestTick(deps, state));

  state.prepJobs.set(ticketId, job);
  deps.log?.('info', `workspace of ${ticketId} is being prepared`, { plan: plan.source });

  return job;
}

/** Waits for `job` up to the grace period; true when it finished in time. */
async function settledSoon(job: PrepJob): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const grace = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, PREP_GRACE_MS);
  });

  await Promise.race([job.done, grace]);
  clearTimeout(timer);

  return job.outcome !== undefined;
}

/** The ticket remembers its worktree and branch from the first job, so a cancel can clean them. */
async function rememberWorkspace(
  ctx: EngineCtx,
  ticket: Ticket,
  wt: Worktree,
  branch: string,
): Promise<void> {
  await moveTicket(ctx.deps.storage, ticket.id, ctx.nowIso, (t) =>
    t.worktree === undefined || t.branch === undefined
      ? { events: [], fields: { worktree: wt.path, branch } }
      : null,
  );
}

async function noteReady(
  ctx: EngineCtx,
  ticket: Ticket,
  job: PrepJob,
  steps: readonly { restored?: boolean | undefined }[],
): Promise<void> {
  if (steps.length === 0) {
    return;
  }

  const restored = steps.some((s) => s.restored === true);

  const seconds = Math.max(
    1,
    Math.round((ctx.deps.clock.now() - job.startedAt) / SECOND_MS),
  );

  await ctx.deps.storage.transaction((tx) =>
    logCardEvent(tx, ticket.card_id, {
      kind: 'note',
      at: ctx.nowIso,
      actor: ENGINE_ACTOR,
      payload: {
        text: `${ticket.id} workspace ready in ${seconds} s${restored ? ' (restored from cache)' : ''}`,
      },
    }),
  );
}

/**
 * Makes sure `ticket`'s worktree `wt` is ready for a Worker or a check. `ready`: go on.
 * `pending`: a job is running; the caller returns false and its wake or candidate stays due.
 * `failed`: a step failed and `park` already moved the ticket to the owner. A runtime with no
 * preparer, or an empty plan, is `ready` without a job.
 */
export async function ensurePrepared(
  ctx: EngineCtx,
  runtime: ProjectRuntime,
  ticket: Ticket,
  wt: Worktree,
  branch: string,
  park: (failure: PrepFailure) => Promise<void>,
): Promise<PrepState> {
  const prepare = runtime.prepare;
  if (!prepare) {
    return 'ready';
  }

  const { state } = ctx;
  let job = state.prepJobs.get(ticket.id);
  if (!job) {
    const plan = await prepare.plan(wt.path, runtime.config);
    if (plan.steps.length === 0) {
      return 'ready';
    }

    job = startJob(ctx, prepare, ticket.id, wt, plan);
    await rememberWorkspace(ctx, ticket, wt, branch);
    await settledSoon(job);
  }

  const { outcome } = job;
  if (!outcome) {
    return 'pending';
  }

  state.prepJobs.delete(ticket.id);
  if (!outcome.ok) {
    throw outcome.error;
  }

  if (outcome.outcome.ok) {
    await noteReady(ctx, ticket, job, outcome.outcome.prep.steps);

    return 'ready';
  }

  // The Worker's own edit to a lockfile broke the install: the Worker must be able to fix it, so it
  // starts anyway. The gates fail the same way until it does, and that is the Worker's rework.
  if (outcome.outcome.inputs_changed_by_worker) {
    ctx.deps.log?.(
      'warn',
      `setup of ${ticket.id} fails after the Worker's change; starting it`,
    );

    return 'ready';
  }

  await park(outcome.outcome);

  return 'failed';
}

/** The tool folders the worktree's setup recorded (`.venv/bin`), or none; a record that cannot be read is no folders. */
export async function prepPaths(
  runtime: Pick<ProjectRuntime, 'worktrees'>,
  worktree: string,
): Promise<string[]> {
  const record = await runtime.worktrees.readPrep(worktree).catch(() => null);

  return record?.path ?? [];
}

/** Forgets finished jobs of tickets that no longer exist or have ended (cancelled while the install ran). */
export async function prunePrepJobs(ctx: EngineCtx): Promise<void> {
  for (const [id, job] of ctx.state.prepJobs) {
    if (job.outcome === undefined) {
      continue;
    }

    const ticket = await ctx.deps.storage.transaction((tx) =>
      tx.tickets.get(id as TicketId),
    );

    if (!ticket || TERMINAL_STATUSES.includes(ticket.status)) {
      ctx.state.prepJobs.delete(id);
    }
  }
}
