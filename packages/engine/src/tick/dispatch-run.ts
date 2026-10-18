/**
 * Starts one Worker run for one ticket: stage, worktree, prompt, run row, token, driver, ticket.
 *
 * Why: dispatch is the moment the Director commits spend and risk, so its order matters.
 *   The ticket's pipeline snapshot comes first (taken at the first dispatch, checked against the
 *   roster as it is now), and its stage cursor says which writer runs: the stage's agent, not a
 *   lane default; a stage whose agent cannot run parks the ticket visibly instead of running
 *   someone else (fail closed). A `stage` wake on a verifying ticket starts a check instead
 *   (tick/dispatch-check). The worktree comes next (d-0059: a Worker never runs in the main
 *   checkout), then the `dispatch_prompt` step renders the brief from the ticket, project memory
 *   and what changed since the last run, plus the Worker contract (shell rules, typed claims for
 *   every edit), which is also appended to the returned prompt verbatim so a paraphrase cannot drop it.
 *   An agent other than the built-in implementer is named to the step so the brief is written for
 *   its role (a tester writes failing tests only); its instructions go between the brief and the
 *   rules. The run row, the stage attempt it carries and the per-run token are written together
 *   (tick/launch-run) before the harness starts. The ticket moves to `in_progress` only once the
 *   harness accepted the run; a start that throws settles the run as a failure and the family
 *   decides retry or park. A resume is a NEW run that names the old one in `retry_of` (d-0055):
 *   an ended run is never reopened.
 *
 * Exports: startRun().
 * Depends on: tick/memory-context (the memory shown to the Director), @forge/core (branchName, DispatchPromptOutput, IMPLEMENTER_ID), steps/run-step,
 *   domain/worker-contract, tick/{agent-prompt,project-runtime,dispatch-park,dispatch-check,dispatch-stage,
 *   launch-run,stage-records,ticket-moves,wake-delta}, shared/trace.
 */

import {
  DispatchPromptOutput,
  IMPLEMENTER_ID,
  InvalidInputError,
  branchName,
} from '@forge/core';
import type { Ticket, Worktree, WorkerDriver } from '@forge/core';
import { renderWorkerContract, workerContract } from '#/domain/worker-contract.js';
import { hold, rejectStep, runStep } from '#/steps/run-step.js';
import { buildMemoryContext, questionOf } from '#/tick/memory-context.js';
import { workerPrompt } from '#/tick/agent-prompt.js';
import { startChecks } from '#/tick/dispatch-check.js';
import { chooseWriter } from '#/tick/dispatch-stage.js';
import { parkDispatch, parkForHarness } from '#/tick/dispatch-park.js';
import { launchRun } from '#/tick/launch-run.js';
import { baseRefFor, driverFor, runtimeFor } from '#/tick/project-runtime.js';
import { beginStageRun } from '#/tick/stage-records.js';
import { moveTicket } from '#/tick/ticket-moves.js';
import { wakeDelta } from '#/tick/wake-delta.js';
import type { EngineCtx } from '#/types/engine-state.types.js';
import type { Candidate } from '#/types/tick.types.js';

const msg = (e: unknown): string => String(e instanceof Error ? e.message : e);

/**
 * Starts a run for `c` on `harnessId` (the agent's own harness unless the scheduler
 * chose a fallback); returns true when a run is now live. Never throws.
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
  const { project, previous, answered } = await deps.storage.transaction(async (tx) => {
    // A rework wake of one writer-group member carries `~member` after the run id it follows.
    const prevId = c.kind === 'retry' ? c.wake?.idempotency_key.split('~')[0] : undefined;

    const interaction =
      c.kind === 'resume' && c.wake
        ? await tx.interactions.get(c.wake.idempotency_key)
        : null;

    const prev = prevId
      ? await tx.runs.get(prevId)
      : interaction?.run_id
        ? await tx.runs.get(interaction.run_id)
        : null;

    return {
      project: await tx.projects.get(ticket.project),
      previous: prev,
      answered: interaction,
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

  const branch = ticket.branch ?? branchName(ticket.type, ticket.id, ticket.title);
  let wt: Worktree;
  try {
    wt = await runtime.worktrees.create(ticket.id, branch, baseRefFor(ctx, project.slug));
  } catch (e) {
    // Bad input a retry cannot fix (a repository with no commit yet): the user must act.
    if (e instanceof InvalidInputError) {
      await parkDispatch(ctx, ticket, e);

      return false;
    }

    throw e;
  }

  const slice = await buildMemoryContext(ctx, project.slug, {
    question: questionOf(ticket.title, ticket.body),
    rewrite: false,
    filter: agent.definition.memory,
  });

  const contract = workerContract({
    rework: c.kind === 'retry' && c.wake?.kind === 'continuation',
    checks: runtime.config.checks,
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
      wake: wakeDelta(c, answered, stage),
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

    return false;
  }

  // The rules are facts about the environment: appended verbatim, whatever the step or agent wrote.
  const prompt = workerPrompt(
    drafted.value.prompt,
    agent.definition.instructions,
    renderWorkerContract(contract),
  );

  const resumeSession =
    // A session belongs to the harness that made it: a fallback harness starts fresh.
    c.kind === 'resume' && driver.capabilities().resume && previous?.harness === driver.id
      ? previous?.session_ref
      : undefined;

  const launched = await launchRun(ctx, {
    ticket,
    agent,
    harness,
    driver,
    wt,
    prompt,
    previous,
    resumeSession,
    wake: c.wake,
    inTx:
      stage && state
        ? async (tx, runId) => {
            await beginStageRun(tx, ctx.nowIso, {
              ticket_id: ticket.id,
              stage_id: stage.id,
              member_id: choice.memberId ?? '',
              cycle: state.cycle,
              kind: 'agent',
              agent_id: agent.id,
              agent_hash: agent.hash,
              run_id: runId,
            });
          }
        : undefined,
  });

  if (!launched) {
    return false;
  }

  const { runId, handle } = launched;
  const fields = { assignee_run_id: runId, branch, worktree: wt.path };
  const moved = await moveTicket(deps.storage, ticket.id, ctx.nowIso, (t: Ticket) => {
    if (t.status === 'planned') {
      return { events: [{ type: 'dispatched' }], fields };
    }

    if (t.status === 'waiting_human') {
      return { events: [{ type: 'answered' }], fields };
    }

    if (t.status === 'in_progress') {
      return { events: [], fields };
    }

    return null;
  });

  if (!moved.ok) {
    deps.log?.(
      'error',
      `run ${runId} started but ${ticket.id} could not take it; cancelling`,
      { reason: moved.reason },
    );

    await driver.cancel(handle).catch(() => undefined);

    return false;
  }

  ctx.report.dispatched.push({ ticketId: ticket.id, runId, kind: c.kind });

  return true;
}
