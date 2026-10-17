/**
 * Starts one Worker run for one ticket: worktree, prompt, run row, token, driver, ticket.
 *
 * Why: dispatch is the moment the Director commits spend and risk, so its order matters.
 *   The worktree comes first (d-0059: a Worker never runs in the main checkout), then the
 *   `dispatch_prompt` step renders the brief from the ticket, project memory and what
 *   changed since the last run, plus the Worker contract (shell rules, typed claims for
 *   every edit), which is also appended to the returned prompt verbatim so a paraphrase
 *   cannot drop it. The run row and the per-run token (stored only as a hash)
 *   are written together before the harness starts, so a crash after start leaves a run the
 *   restart rule can find and revoke (d-0054). The ticket moves to `in_progress` only once
 *   the harness accepted the run; a start that throws settles the run as a failure and the
 *   family decides retry or park. The redacted brief is stored as the run's first `prompt`
 *   event in the same transaction as the run row. A resume is a NEW run that names the old one in
 *   `retry_of` (d-0055): an ended run is never reopened.
 *
 * Exports: startRun().
 * Depends on: @forge/core (branchName, DispatchPromptOutput), @forge/tools (sha256Hex),
 *   steps/run-step, domain/worker-contract, tick/project-runtime, tick/dispatch-park, tick/pump, tick/settle, tick/ticket-moves, domain/results.
 */

import {
  DispatchPromptOutput,
  HarnessChangedError,
  InvalidInputError,
  branchName,
} from '@forge/core';
import type { Run, Ticket, Worktree, WorkerDriver } from '@forge/core';
import { scrubSecrets, sha256Hex } from '@forge/tools';
import { familyOf, failureResult } from '#/domain/results.js';
import { renderWorkerContract, workerContract } from '#/domain/worker-contract.js';
import { hold, rejectStep, runStep } from '#/steps/run-step.js';
import { parkDispatch, parkForHarness } from '#/tick/dispatch-park.js';
import { baseRefFor, driverFor, runtimeFor } from '#/tick/project-runtime.js';
import { configVersionRef } from '#/tick/tick-config.js';
import { emitTrace } from '#/shared/trace.js';
import { startPump } from '#/tick/pump.js';
import { buildRunRequest } from '#/tick/run-request.js';
import { settleRun } from '#/tick/settle.js';
import { moveTicket } from '#/tick/ticket-moves.js';
import { wakeDelta } from '#/tick/wake-delta.js';
import type { EngineCtx } from '#/types/engine-state.types.js';
import type { Candidate } from '#/types/tick.types.js';

const msg = (e: unknown): string => String(e instanceof Error ? e.message : e);

/**
 * Starts a run for `c` on `harnessId` (the project's own harness unless the scheduler
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
  const { deps, state } = ctx;
  const { ticket } = c;
  const { project, previous, answered } = await deps.storage.transaction(async (tx) => {
    const prevId = c.kind === 'retry' ? c.wake?.idempotency_key : undefined;
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

  const runtime = runtimeFor(ctx, project.slug);
  if (!runtime) {
    throw new Error(`project ${project.slug} has no runtime on this server`);
  }

  let driver: WorkerDriver;
  try {
    driver = driverFor(ctx, project.slug, harnessId);
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

  const slice = await deps.memory.slice(project.slug);
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
      wake: wakeDelta(c, answered),
      // The Worker must finish with typed claims for every edit (G1 fails a finish without).
      worker_contract: contract,
    },
    DispatchPromptOutput,
  );

  if (!drafted.ok) {
    rejectStep(ctx, 'dispatch_prompt', ticket.id, drafted.error);
    hold(ctx, `dispatch:${ticket.id}`);

    return false;
  }

  // The rules are facts about the environment: appended verbatim, whatever the step wrote.
  const prompt = [drafted.value.prompt, renderWorkerContract(contract)].join('\n\n');
  const promptHash = sha256Hex(prompt);

  const runId = deps.ids.runId();
  const token = deps.ids.token();
  const run: Run = {
    id: runId,
    ticket_id: ticket.id,
    project: ticket.project,
    harness: driver.id,
    driver_version: 'unversioned',
    cwd: wt.path,
    lane: ticket.lane,
    started_at: ctx.nowIso,
    status: 'starting',
    owner: deps.owner,
    ...(previous ? { retry_of: previous.id } : {}),
    prompt_hash: promptHash,
    catalogue_hash: await deps.catalogueHash(driver.id),
    config_version: configVersionRef(ctx.config, project.slug),
  };

  await deps.storage.transaction(async (tx) => {
    await tx.runs.insert(run);
    // The brief is the first event of the run: the thread shows what the Worker was told.
    await tx.runEvents.append(runId, {
      type: 'prompt',
      ts: ctx.nowIso,
      text: scrubSecrets(prompt, []),
    });

    await tx.runTokens.issue(runId, sha256Hex(token), ctx.nowIso);
    if (c.wake) {
      await tx.wakeRequests.markConsumed(c.wake.id, ctx.nowIso);
    }
  });

  state.baseShas.set(runId, wt.baseSha);

  const resumeSession =
    // A session belongs to the harness that made it: a fallback harness starts fresh.
    c.kind === 'resume' && driver.capabilities().resume && previous?.harness === driver.id
      ? previous?.session_ref
      : undefined;

  const req = buildRunRequest(ctx, {
    runId,
    ticket,
    cwd: wt.path,
    prompt,
    promptHash,
    token,
    ...(resumeSession ? { resume: resumeSession } : {}),
  });

  emitTrace(deps, {
    level: 'info',
    kind: 'run',
    project: ticket.project,
    ticket_id: ticket.id,
    run_id: runId,
    actor: 'engine',
    message: `run start ${runId} for ${ticket.id} on ${driver.id}`,
    // The request carries the run token and env; the trace's redaction pass removes them.
    data: { harness: driver.id, resume: resumeSession ?? null, request: req },
  });

  let handle;
  try {
    handle = await driver.start(req);
  } catch (e) {
    deps.log?.('error', `driver.start failed for ${runId}`, { error: msg(e) });
    // A build that changed under the approvals parks the ticket with that reason, not a generic one.
    await settleRun(
      ctx,
      run,
      failureResult(familyOf(e)),
      undefined,
      e instanceof HarnessChangedError
        ? { parkReason: msg(e), parkBuild: { installed: e.installed } }
        : {},
    );

    return false;
  }

  startPump(deps, state, runId, handle, driver);
  await deps.storage.transaction((tx) => tx.runs.update(runId, { status: 'running' }));

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
