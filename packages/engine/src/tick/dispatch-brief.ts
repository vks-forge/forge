/**
 * The brief of a Worker run: worktree, preparation, memory and the `dispatch_prompt` step, as a job.
 *
 * Why: cutting a worktree, installing its packages and having the Director write the brief take
 *   seconds to minutes. Awaited in the tick, one ticket's brief kept every other ticket from
 *   settling or starting its Worker, and a planning turn ahead of it made Workers wait behind the
 *   Director. So the tick starts a brief job and reserves the Worker slot the run will take
 *   (`state.briefing`, which the scheduler counts as running, so the global, project, harness and In
 *   Progress limits hold, d-0097); the job does the slow part and hands back a launch, a park or
 *   nothing, and the next tick applies it (tick/dispatch-launch). A brief takes no Director slot: the
 *   Worker limits already bound it. A failing brief keeps its old effect: the step is rejected and
 *   the ticket is held off for a while. Anything that moves ticket state (a park for a setup that
 *   failed, a repository with no commit) is returned for the tick to apply, never done by the job.
 *   The reservation is released when the tick has applied the result, whatever it was.
 *
 * Exports: startBrief().
 * Depends on: @forge/core (DispatchPromptOutput, IMPLEMENTER_ID, InvalidInputError, PrepFailure),
 *   domain/{conflict-wake,worker-contract}, steps/run-step, tick/{agent-prompt,base-sync,dispatch-launch,
 *   dispatch-park,director-jobs,memory-context,prep-jobs,wake-delta}, types/{dispatch-start,director-jobs}.
 */

import { DispatchPromptOutput, IMPLEMENTER_ID, InvalidInputError } from '@forge/core';
import type { PrepFailure, Worktree } from '@forge/core';
import { parseConflictWake } from '#/domain/conflict-wake.js';
import { renderWorkerContract, workerContract } from '#/domain/worker-contract.js';
import { hold, rejectStep, runStep } from '#/steps/run-step.js';
import { workerPrompt } from '#/tick/agent-prompt.js';
import { createWorktree } from '#/tick/base-sync.js';
import { startDirectorJob, ticketKey } from '#/tick/director-jobs.js';
import { launchBriefed } from '#/tick/dispatch-launch.js';
import { parkDispatch, parkForSetup } from '#/tick/dispatch-park.js';
import { buildMemoryContext, questionOf } from '#/tick/memory-context.js';
import { ensurePrepared, prepPaths } from '#/tick/prep-jobs.js';
import { wakeDelta } from '#/tick/wake-delta.js';
import type { Briefed, StartPlan } from '#/types/dispatch-start.types.js';
import type { DirectorApply } from '#/types/director-jobs.types.js';
import type { EngineCtx } from '#/types/engine-state.types.js';

const msg = (e: unknown): string => String(e instanceof Error ? e.message : e);

/** Cuts and prepares the worktree, then has the Director write the brief. Runs in the job. */
async function brief(ctx: EngineCtx, plan: StartPlan): Promise<Briefed> {
  const { candidate: c, runtime, project, agent, stage, branch } = plan;
  const { ticket } = c;
  let wt: Worktree;
  try {
    wt = await createWorktree(ctx, runtime, project.slug, ticket.id, branch);
  } catch (e) {
    // Bad input a retry cannot fix (a repository with no commit yet): the user must act.
    if (e instanceof InvalidInputError) {
      return { kind: 'park', park: (tick) => parkDispatch(tick, ticket, e) };
    }

    throw e;
  }

  // Workers may not install packages: Forge gets the tree ready first, beside the tick (d-0180).
  let failure: PrepFailure | undefined;
  const ready = await ensurePrepared(ctx, runtime, ticket, wt, branch, async (f) => {
    failure = f;
  });

  if (ready === 'failed' && failure !== undefined) {
    const setup = failure;

    return { kind: 'park', park: (tick) => parkForSetup(tick, ticket, setup) };
  }

  if (ready !== 'ready') {
    return { kind: 'wait' };
  }

  const slice = await buildMemoryContext(ctx, project.slug, {
    question: questionOf(ticket.title, ticket.body),
    rewrite: false,
    filter: agent.definition.memory,
  });

  const contract = workerContract({
    rework: c.kind === 'retry' && c.wake?.kind === 'continuation',
    conflict: parseConflictWake(c.wake?.reason) !== null,
    checks: runtime.config.checks,
    lane: ticket.lane,
    approvals: plan.approvals,
  });

  const drafted = await runStep(
    ctx,
    'dispatch_prompt',
    {
      ticket: {
        id: ticket.id,
        title: ticket.title,
        body: ticket.body,
        type: ticket.type,
        lane: ticket.lane,
      },
      memory: slice,
      worktree: { path: wt.path, branch },
      wake: wakeDelta(c, plan.answered, stage, plan.approvals, plan.retry),
      // The Worker must finish with typed claims for every edit (G1 fails a finish without).
      worker_contract: contract,
      // The step writes the brief for the agent's role; the implementer needs no naming.
      ...(agent.id === IMPLEMENTER_ID
        ? {}
        : {
            agent: {
              id: agent.id,
              role: agent.definition.role,
              instructions: agent.definition.instructions,
            },
          }),
    },
    DispatchPromptOutput,
  );

  if (!drafted.ok) {
    rejectStep(ctx, 'dispatch_prompt', ticket.id, drafted.error);
    hold(ctx, `dispatch:${ticket.id}`);

    return { kind: 'wait' };
  }

  // The rules are facts about the environment: appended verbatim, whatever the step or agent wrote.
  return {
    kind: 'launch',
    wt,
    prompt: workerPrompt(
      drafted.value.prompt,
      agent.definition.instructions,
      renderWorkerContract(contract),
    ),
    pathPrepend: await prepPaths(runtime, wt.path),
  };
}

/**
 * The job body: never throws. Whatever happens, the returned apply releases the slot reservation
 * after doing what the brief decided; a failure holds the ticket off and is reported.
 */
async function briefJob(job: EngineCtx, plan: StartPlan): Promise<DirectorApply> {
  const id = plan.candidate.ticket.id;
  let briefed: Briefed = { kind: 'wait' };
  try {
    briefed = await brief(job, plan);
  } catch (e) {
    hold(job, `dispatch:${id}`);
    job.report.errors.push({ where: `dispatch ${id}`, message: msg(e) });
    job.deps.log?.('error', `dispatch of ${id} failed`, { error: msg(e) });
  }

  return async (tick) => {
    try {
      if (briefed.kind === 'park') {
        await briefed.park(tick);
      } else if (briefed.kind === 'launch') {
        await launchBriefed(tick, plan, briefed);
      }
    } catch (e) {
      hold(tick, `dispatch:${id}`);
      tick.report.errors.push({ where: `dispatch ${id}`, message: msg(e) });
      tick.deps.log?.('error', `dispatch of ${id} failed`, { error: msg(e) });
    } finally {
      tick.state.briefing.delete(id);
    }
  };
}

/** Reserves the Worker slot and starts the brief job; false when the ticket already has a job tracked. */
export function startBrief(ctx: EngineCtx, plan: StartPlan): boolean {
  const { ticket } = plan.candidate;
  const started = startDirectorJob(ctx, {
    key: ticketKey(ticket.id),
    kind: 'brief',
    subject: ticket.id,
    run: (job) => briefJob(job, plan),
  });

  if (started === null) {
    return false;
  }

  ctx.state.briefing.set(ticket.id, {
    project: ticket.project,
    harness: plan.harness,
    entering: ticket.status !== 'in_progress' && ticket.status !== 'verifying',
  });

  return true;
}
