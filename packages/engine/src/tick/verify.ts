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
 *   twice. If the branch moved after the gates passed, nothing merges and the new head is
 *   gated again. At most `max_concurrent_by_state.verifying` tickets are worked per tick.
 *
 * Exports: verifyReady().
 * Depends on: domain/{gate-rows,ticket-numbers}, tick/{gate-jobs,project-runtime},
 *   tick/verify-{publish,gates,outcomes,merge}.
 */

import { ForgeError, PolicyDeniedError } from '@forge/core';
import type { GateVerdict, Ticket } from '@forge/core';
import { latestPerGate, summarizeGates } from '#/domain/gate-rows.js';
import { ticketNumber } from '#/domain/ticket-numbers.js';
import { isHeld } from '#/steps/run-step.js';
import { jobKey, pruneGateJobs, startGateJob } from '#/tick/gate-jobs.js';
import { baseRefFor, runtimeFor } from '#/tick/project-runtime.js';
import { readClaims } from '#/tick/verify-gates.js';
import { passAndMerge } from '#/tick/verify-merge.js';
import {
  handleVerifyFailure,
  parkVerifying,
  reworkOrPark,
} from '#/tick/verify-outcomes.js';
import { publishBranch } from '#/tick/verify-publish.js';
import type { EngineCtx } from '#/types/engine-state.types.js';
import type { GateRun, VerifyTarget } from '#/types/verify.types.js';

/** A branch that keeps moving under the gates is not going to settle by itself. */
const MAX_REGATES = 3;

/** Resolves everything verify needs for a ticket, or null (with a log) when it cannot be verified yet. */
async function resolveTarget(
  ctx: EngineCtx,
  ticket: Ticket,
): Promise<VerifyTarget | null> {
  const { deps } = ctx;
  const { project, run } = await deps.storage.transaction(async (tx) => ({
    project: await tx.projects.get(ticket.project),
    run: ticket.assignee_run_id ? await tx.runs.get(ticket.assignee_run_id) : null,
  }));

  const runtime = project ? runtimeFor(ctx, project.slug) : null;
  if (!project || !runtime || !run || run.status !== 'success') {
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
  // `create` is idempotent for the same ticket and branch and returns the original base.
  const wt = await deps.worktrees.create(ticket.id, ticket.branch, baseRef);

  return {
    ticket,
    run,
    project,
    runtime,
    worktree: ticket.worktree,
    branch: ticket.branch,
    baseRef,
    baseSha: wt.baseSha,
  };
}

/** Publishes the branch and starts the gates on exactly what was pushed; returns at once. */
async function startGating(ctx: EngineCtx, t: VerifyTarget): Promise<void> {
  const target = { ...t, ticket: await publishBranch(ctx, t) };
  const claims = await readClaims(ctx, t.run.id);
  const headSha = await ctx.deps.worktrees.head(t.worktree);
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

async function verifyTarget(ctx: EngineCtx, t: VerifyTarget): Promise<void> {
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

    return;
  }

  const finished = consumeJob(ctx, t);
  const verdicts: ReadonlyMap<string, GateVerdict> = finished?.verdicts ?? new Map();
  const stored = await ctx.deps.storage.transaction((tx) =>
    tx.gateResults.listByTicket(t.ticket.id),
  );

  const rows = latestPerGate(stored.filter((r) => r.run_id === t.run.id));
  const summary = summarizeGates(rows, gates);

  if (summary.kind === 'error') {
    if (finished) {
      throw new ForgeError(
        finished.errorFamily ?? 'unknown',
        `gate ${summary.gates.join(', ')} could not run`,
      );
    }

    // No usable verdicts for this run yet (or a gate could not run last time): gate again.
    return startGating(ctx, t);
  }

  if (summary.kind === 'fail') {
    return reworkOrPark(ctx, t, rows, verdicts);
  }

  if ((await passAndMerge(ctx, t, rows)) === 'regate') {
    return regate(ctx, t, key);
  }
}

/** The head moved after the gates passed: judge the new head, a bounded number of times. */
async function regate(ctx: EngineCtx, t: VerifyTarget, key: string): Promise<void> {
  const n = (ctx.state.regates.get(key) ?? 0) + 1;
  ctx.state.regates.set(key, n);
  if (n > MAX_REGATES) {
    return parkVerifying(
      ctx,
      t,
      `the PR head moved ${MAX_REGATES} times while the gates ran; needs a human to settle the branch`,
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

  let worked = 0;
  for (const ticket of tickets) {
    if (worked >= limit) {
      break;
    }

    if (isHeld(ctx, `verify:${ticket.id}`)) {
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
