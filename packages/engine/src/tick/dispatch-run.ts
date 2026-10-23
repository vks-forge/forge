/**
 * Starts one Worker run for one ticket: stage, writer and harness in the tick, then the brief job.
 *
 * Why: dispatch is the moment the Director commits spend and risk, so its order matters.
 *   The ticket's pipeline snapshot comes first (taken at the first dispatch, checked against the
 *   roster as it is now), and its stage cursor says which writer runs: the stage's agent, not a
 *   lane default; a stage whose agent cannot run parks the ticket visibly instead of running
 *   someone else (fail closed). A `stage` wake on a verifying ticket starts a check instead
 *   (tick/dispatch-check). A harness that is not installed parks the ticket too. Those decisions
 *   are quick and move ticket state, so they stay in the tick. What is slow (the worktree d-0059,
 *   its preparation d-0180, the memory slice and the `dispatch_prompt` step that renders the brief
 *   from the ticket, project memory and what changed since the last run, plus the Worker contract)
 *   runs as a brief job beside the tick (tick/dispatch-brief), holding the run's Worker slot, so a
 *   slow brief never holds up the other tickets; the next tick launches the run (tick/dispatch-launch).
 *   A resume is a NEW run that names the old one in `retry_of` (d-0055): an ended run is never reopened.
 *
 * Exports: startRun().
 * Depends on: @forge/core (branchName), domain/retry-context, tick/{retry-facts,approval-wake,dispatch-brief,dispatch-check,dispatch-park,
 *   dispatch-stage,project-runtime}, steps/run-step, types/dispatch-start. IO: storage.
 */

import { branchName } from '@forge/core';
import type { WorkerDriver } from '@forge/core';
import { retryContext } from '#/domain/retry-context.js';
import { hold } from '#/steps/run-step.js';
import { approvalsOfRun, runOfPermWake } from '#/tick/approval-wake.js';
import { startBrief } from '#/tick/dispatch-brief.js';
import { startChecks } from '#/tick/dispatch-check.js';
import { parkForHarness } from '#/tick/dispatch-park.js';
import { chooseWriter } from '#/tick/dispatch-stage.js';
import { driverFor, runtimeFor } from '#/tick/project-runtime.js';
import { readRetryFacts } from '#/tick/retry-facts.js';
import type { EngineCtx } from '#/types/engine-state.types.js';
import type { Candidate } from '#/types/tick.types.js';

const msg = (e: unknown): string => String(e instanceof Error ? e.message : e);

/**
 * Starts the run for `c` on `harnessId` (the agent's own harness unless the scheduler
 * chose a fallback): a check starts now, a writer's brief starts as a job. Returns true when a
 * run or a brief is under way. Never throws.
 */
export async function startRun(
  ctx: EngineCtx,
  c: Candidate,
  harnessId?: string,
): Promise<boolean> {
  const { ticket } = c;
  try {
    return await tryStart(ctx, c, harnessId);
  } catch (e) {
    hold(ctx, `dispatch:${ticket.id}`);
    ctx.report.errors.push({ where: `dispatch ${ticket.id}`, message: msg(e) });
    ctx.deps.log?.('error', `dispatch of ${ticket.id} failed`, { error: msg(e) });

    return false;
  }
}

async function tryStart(
  ctx: EngineCtx,
  c: Candidate,
  harnessId?: string,
): Promise<boolean> {
  const { deps } = ctx;
  const { ticket } = c;
  const { project, previous, answered, approvals, retry } =
    await deps.storage.transaction(async (tx) => {
      // A rework wake of one writer-group member carries `~member` after the run id it follows.
      const prevId =
        c.kind === 'retry' ? c.wake?.idempotency_key.split('~')[0] : undefined;

      // A tool-approval wake names the run itself (`perm:<run id>`), not one interaction.
      const permRun =
        c.kind === 'resume' && c.wake ? runOfPermWake(c.wake.idempotency_key) : null;

      const interaction =
        c.kind === 'resume' && c.wake && permRun === null
          ? await tx.interactions.get(c.wake.idempotency_key)
          : null;

      const prev = prevId
        ? await tx.runs.get(prevId)
        : permRun
          ? await tx.runs.get(permRun)
          : interaction?.run_id
            ? await tx.runs.get(interaction.run_id)
            : null;

      return {
        project: await tx.projects.get(ticket.project),
        previous: prev,
        answered: interaction,
        approvals: permRun ? await approvalsOfRun(tx, ticket.id, permRun) : [],
        retry:
          c.kind === 'retry'
            ? retryContext(await readRetryFacts(tx, ticket, c.wake?.idempotency_key))
            : null,
      };
    });

  if (!project) {
    throw new Error(`ticket ${ticket.id} names unknown project ${ticket.project}`);
  }

  if (c.kind === 'stage' && ticket.status === 'verifying') {
    return startChecks(ctx, c, project, harnessId);
  }

  const runtime = runtimeFor(ctx, project.slug);
  if (!runtime) {
    throw new Error(`project ${project.slug} has no runtime on this server`);
  }

  const choice = await chooseWriter(ctx, ticket, project.slug, previous, c.member);
  if (choice.kind === 'stop') {
    return false;
  }

  const { agent, stage, state } = choice;
  const harness = harnessId ?? agent.harnessId;
  let driver: WorkerDriver;
  try {
    driver = driverFor(ctx, project.slug, harness);
  } catch (e) {
    await parkForHarness(ctx, ticket, e);

    return false;
  }

  return startBrief(ctx, {
    candidate: c,
    project,
    runtime,
    previous,
    answered,
    approvals,
    retry,
    agent,
    ...(stage === undefined ? {} : { stage }),
    ...(choice.memberId === undefined ? {} : { memberId: choice.memberId }),
    state,
    harness,
    driver,
    branch: ticket.branch ?? branchName(ticket.type, ticket.id, ticket.title),
  });
}
