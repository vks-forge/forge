/**
 * Verify phase: publish finished work, gate it in the background, then merge, hand back or park.
 *
 * Why: a run that succeeded has only produced a claim of being done. This phase turns the
 *   worktree into a pushed branch and a PR, has independent gates judge that exact commit,
 *   and acts on the verdicts: tier A merges, tier B/C wait for a human, a failed gate sends
 *   the Worker back with the findings, and an infrastructure fault retries or parks by its
 *   error family. The gates take minutes, so they run as a job beside the tick: one tick
 *   publishes and starts the job, a later tick (requested when the job ends) applies the
 *   stored verdicts. Every step is resumable from stored facts (the PR number on the ticket,
 *   the `gate_results` rows of the run with the sha they judged, `tier_actual`), so a crash
 *   anywhere repeats at most an idempotent push and never opens a second PR or merges
 *   twice. Before the gates, main is merged into the branch (tick/verify-sync) and a clash goes back
 *   to the ticket's writer. If the branch or main moved after the gates passed, nothing merges and
 *   the new head is gated again. At most `max_concurrent_by_state.verifying` tickets are worked per tick.
 *
 * Exports: verifyReady(), resolveTarget().
 * Depends on: domain/{gate-rows,ticket-numbers}, tick/{gate-jobs,project-runtime},
 *   tick/verify-{publish,sync,gates,outcomes,merge}.
 */

import { ForgeError, PolicyDeniedError, conflictMarkerFiles } from '@forge/core';
import type { GateVerdict, Ticket } from '@forge/core';
import { latestPerGate, summarizeGates } from '#/domain/gate-rows.js';
import { ticketNumber } from '#/domain/ticket-numbers.js';
import { isHeld } from '#/steps/run-step.js';
import { jobKey, pruneGateJobs, startGateJob } from '#/tick/gate-jobs.js';
import { pruneCheckJobs } from '#/tick/stage-director-check.js';
import { pruneStageJobs } from '#/tick/stage-script-jobs.js';
import { createWorktree } from '#/tick/base-sync.js';
import { baseRefFor, runtimeFor } from '#/tick/project-runtime.js';
import { driveStages } from '#/tick/stage-runner.js';
import { reworkOrPark } from '#/tick/stage-send-back.js';
import { isUnservable } from '#/tick/tick-config.js';
import { readClaims } from '#/tick/verify-gates.js';
import { passAndMerge } from '#/tick/verify-merge.js';
import { handleVerifyFailure, parkVerifying } from '#/tick/verify-outcomes.js';
import { commitWork, publishBranch } from '#/tick/verify-publish.js';
import { g1StageId, routeConflict, syncBaseIntoBranch } from '#/tick/verify-sync.js';
import type { EngineCtx } from '#/types/engine-state.types.js';
import type { G1Result } from '#/types/stage-runner.types.js';
import type { GateRows, GateRun, MergeOpts, VerifyTarget } from '#/types/verify.types.js';

/** A branch that keeps moving under the gates is not going to settle by itself. */
const MAX_REGATES = 3;

/** Resolves everything verify needs for a ticket, or null (with a log) when it cannot be verified yet. */
export async function resolveTarget(
  ctx: EngineCtx,
  ticket: Ticket,
): Promise<VerifyTarget | null> {
  const { deps } = ctx;
  const { project, run } = await deps.storage.transaction(async (tx) => ({
    project: await tx.projects.get(ticket.project),
    run: ticket.assignee_run_id ? await tx.runs.get(ticket.assignee_run_id) : null,
  }));

  const runtime = project ? runtimeFor(ctx, project.slug) : null;
  // A project with no git host has nowhere to publish: its tickets wait in Verifying.
  if (!project || !runtime?.gitHost || !run || run.status !== 'success') {
    deps.log?.(
      'debug',
      `${ticket.id} waits in verifying: no project runtime or finished run`,
    );

    return null;
  }

  if (!ticket.worktree || !ticket.branch) {
    deps.log?.('error', `${ticket.id} is verifying without a worktree or branch`);

    return null;
  }

  // One base for the worktree, the diff and the PR: the project's own, never a second default.
  const baseRef = baseRefFor(ctx, project.slug);
  // `create` is idempotent for the same ticket and branch; cut from the host's fetched base it reports
  // the merge base with it, which is the new base tip once main has been merged into the branch.
  const wt = await createWorktree(ctx, runtime, project.slug, ticket.id, ticket.branch);

  return {
    ticket,
    run,
    project,
    runtime: { ...runtime, gitHost: runtime.gitHost },
    worktree: ticket.worktree,
    branch: ticket.branch,
    baseRef,
    baseSha: wt.baseSha,
  };
}

/**
 * Commits the run's work, brings main into the branch, publishes it and starts the gates on exactly
 * what was pushed; returns at once. A clash with main goes to the ticket's writer instead (tick/verify-sync).
 */
async function startGating(ctx: EngineCtx, t: VerifyTarget): Promise<void> {
  await commitWork(t);
  const synced = await syncBaseIntoBranch(ctx, t);
  if (synced.kind === 'handled') {
    return;
  }

  const target = {
    ...t,
    baseSha: synced.baseSha,
    ticket: await publishBranch(ctx, t, true),
  };

  const claims = await readClaims(ctx, t.run.id);
  const headSha = await t.runtime.worktrees.head(t.worktree);
  startGateJob(ctx, target, claims, headSha);
  ctx.deps.log?.('info', `gates started for ${t.ticket.id} on ${headSha}`, {
    run: t.run.id,
  });
}

/** What a finished gate job left for this tick, or null when none was tracked; a job that threw rethrows here. */
function consumeJob(ctx: EngineCtx, t: VerifyTarget): GateRun | null {
  const key = jobKey(t.ticket.id, t.run.id);
  const job = ctx.state.gateJobs.get(key);
  if (!job?.outcome) {
    return null;
  }

  ctx.state.gateJobs.delete(key);
  if (!job.outcome.ok) {
    throw job.outcome.error;
  }

  return job.outcome.run;
}

/** The G1 stage: publish and gate, or read the stored verdicts. `pass` means G1 passed on this run; anything else was handled. */
async function runG1(ctx: EngineCtx, t: VerifyTarget): Promise<G1Result> {
  const { gates } = t.runtime;
  if (gates.length === 0) {
    throw new PolicyDeniedError(
      `project ${t.project.slug} has no gates; refusing to merge`,
    );
  }

  const key = jobKey(t.ticket.id, t.run.id);
  const running = ctx.state.gateJobs.get(key);
  if (running && running.outcome === undefined) {
    ctx.deps.log?.('debug', `${t.ticket.id} waits for its gates to finish`);

    return { kind: 'handled' };
  }

  const finished = consumeJob(ctx, t);
  const verdicts: ReadonlyMap<string, GateVerdict> = finished?.verdicts ?? new Map();
  const rows = await gateRows(ctx, t);
  const summary = summarizeGates(rows, gates);

  if (summary.kind === 'error') {
    if (finished) {
      throw new ForgeError(
        finished.errorFamily ?? 'unknown',
        `gate ${summary.gates.join(', ')} could not run`,
      );
    }

    // No usable verdicts for this run yet (or a gate could not run last time): gate again.
    await startGating(ctx, t);

    return { kind: 'handled' };
  }

  if (summary.kind === 'fail') {
    // A resolver that left conflict markers behind is the same clash, not a failed check (tick/verify-sync).
    const markers = conflictMarkerFiles(
      rows.filter((r) => r.status === 'failed').map((r) => verdicts.get(r.gate)),
    );

    if (markers) {
      await routeConflict(ctx, t, {
        files: markers.map((path) => ({ path })),
        upstream: [],
      });

      return { kind: 'handled' };
    }

    await reworkOrPark(ctx, t, rows, verdicts, await g1StageId(ctx, t.ticket.id));

    return { kind: 'handled' };
  }

  const report = [...verdicts.values()].map((v) => v.report).join('\n\n');

  return { kind: 'pass', rows, ...(report === '' ? {} : { report }) };
}

/** The latest gate row per gate for the target's run. */
async function gateRows(ctx: EngineCtx, t: VerifyTarget): Promise<GateRows> {
  const stored = await ctx.deps.storage.transaction((tx) =>
    tx.gateResults.listByTicket(t.ticket.id),
  );

  return latestPerGate(stored.filter((r) => r.run_id === t.run.id));
}

/** The merge door for a ticket whose stages all passed: merges tier A, holds B/C or a human stage, re-gates a moved head. */
async function mergeStep(
  ctx: EngineCtx,
  t: VerifyTarget,
  rows: GateRows,
  opts: MergeOpts,
): Promise<void> {
  if ((await passAndMerge(ctx, t, rows, opts)) === 'regate') {
    return regate(ctx, t, jobKey(t.ticket.id, t.run.id));
  }
}

async function verifyTarget(ctx: EngineCtx, t: VerifyTarget): Promise<void> {
  await driveStages(ctx, t, { g1: runG1, rows: gateRows, merge: mergeStep });
}

/** The head moved after the gates passed: judge the new head, a bounded number of times. */
async function regate(ctx: EngineCtx, t: VerifyTarget, key: string): Promise<void> {
  const n = (ctx.state.regates.get(key) ?? 0) + 1;
  ctx.state.regates.set(key, n);
  if (n > MAX_REGATES) {
    return parkVerifying(
      ctx,
      t,
      `main kept moving: the branch was brought up to date and re-checked ${MAX_REGATES} times and main changed again each time; needs a human to settle the branch`,
    );
  }

  ctx.deps.log?.('warn', `${t.ticket.id}: PR head is not the commit the gates judged`, {
    attempt: n,
  });

  return startGating(ctx, t);
}

/** Verifies up to the per-state limit of Verifying tickets; a throw on one never blocks the next. */
export async function verifyReady(ctx: EngineCtx): Promise<void> {
  const { deps } = ctx;
  const limit =
    ctx.config.forge.engine.max_concurrent_by_state.verifying ?? Number.POSITIVE_INFINITY;

  const tickets = (
    await deps.storage.transaction((tx) => tx.tickets.listByStatus('verifying'))
  ).sort((a, b) => ticketNumber(a.id) - ticketNumber(b.id));

  pruneGateJobs(ctx, new Set(tickets.map((x) => x.id)));
  pruneStageJobs(ctx, new Set(tickets.map((x) => x.id)));
  pruneCheckJobs(ctx, new Set(tickets.map((x) => x.id)));

  let worked = 0;
  for (const ticket of tickets) {
    if (worked >= limit) {
      break;
    }

    if (isHeld(ctx, `verify:${ticket.id}`) || isUnservable(ctx.config, ticket.project)) {
      continue;
    }

    let target: VerifyTarget | null = null;
    try {
      target = await resolveTarget(ctx, ticket);
      if (!target) {
        continue;
      }

      worked++;
      await verifyTarget(ctx, target);
    } catch (e) {
      if (target) {
        await handleVerifyFailure(ctx, target, e);
      } else {
        ctx.report.errors.push({ where: `verify ${ticket.id}`, message: String(e) });
      }
    }
  }
}
