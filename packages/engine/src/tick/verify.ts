/**
 * Verify phase: publish finished work, run the gates, then merge, hand back or park.
 *
 * Why: a run that succeeded has only produced a claim of being done. This phase turns the
 *   worktree into a pushed branch and a PR, has independent gates judge it, and acts on
 *   the verdicts: tier A merges, tier B/C wait for a human, a failed gate sends the Worker
 *   back with the findings, and an infrastructure fault retries or parks by its error
 *   family. Every step is resumable from stored facts (the PR number on the ticket, the
 *   `gate_results` rows of the run, `tier_actual`), so a crash anywhere repeats at most an
 *   idempotent push and never opens a second PR or merges twice. At most
 *   `max_concurrent_by_state.verifying` tickets are worked per tick.
 *
 * Exports: verifyReady().
 * Depends on: domain/{gate-rows,ticket-numbers}, tick/verify-{publish,gates,outcomes,merge}.
 */

import { ForgeError, PolicyDeniedError } from '@forge/core';
import type { GateVerdict, Ticket } from '@forge/core';
import { latestPerGate, summarizeGates } from '#/domain/gate-rows.js';
import { ticketNumber } from '#/domain/ticket-numbers.js';
import { isHeld } from '#/steps/run-step.js';
import { readClaims, runGates } from '#/tick/verify-gates.js';
import { passAndMerge } from '#/tick/verify-merge.js';
import { handleVerifyFailure, reworkOrPark } from '#/tick/verify-outcomes.js';
import { publishBranch } from '#/tick/verify-publish.js';
import type { EngineCtx } from '#/types/engine-state.types.js';
import type { VerifyTarget } from '#/types/verify.types.js';

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

  const runtime = project ? deps.project(project.slug) : null;
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

  // `create` is idempotent for the same ticket and branch and returns the original base.
  const wt = await deps.worktrees.create(ticket.id, ticket.branch, deps.baseRef);

  return {
    ticket,
    run,
    project,
    runtime,
    worktree: ticket.worktree,
    branch: ticket.branch,
    baseSha: wt.baseSha,
  };
}

async function verifyTarget(ctx: EngineCtx, t: VerifyTarget): Promise<void> {
  const { gates } = t.runtime;
  if (gates.length === 0) {
    throw new PolicyDeniedError(
      `project ${t.project.slug} has no gates; refusing to merge`,
    );
  }

  const stored = await ctx.deps.storage.transaction((tx) =>
    tx.gateResults.listByTicket(t.ticket.id),
  );

  let rows = latestPerGate(stored.filter((r) => r.run_id === t.run.id));
  let verdicts: ReadonlyMap<string, GateVerdict> = new Map();
  let target = t;
  let summary = summarizeGates(rows, gates);

  // No usable verdicts for this run yet (or a gate could not run last time): publish and gate.
  if (summary.kind === 'error') {
    target = { ...t, ticket: await publishBranch(ctx, t) };
    const ran = await runGates(ctx, target, await readClaims(ctx, t.run.id));
    rows = latestPerGate(ran.rows);
    verdicts = ran.verdicts;
    summary = summarizeGates(rows, gates);
    if (summary.kind === 'error') {
      throw new ForgeError(
        ran.errorFamily ?? 'unknown',
        `gate ${summary.gates.join(', ')} could not run`,
      );
    }
  }

  if (summary.kind === 'fail') {
    return reworkOrPark(ctx, target, rows, verdicts);
  }

  return passAndMerge(ctx, target, rows);
}

/** Verifies up to the per-state limit of Verifying tickets; a throw on one never blocks the next. */
export async function verifyReady(ctx: EngineCtx): Promise<void> {
  const { deps } = ctx;
  const limit =
    deps.config.engine.max_concurrent_by_state.verifying ?? Number.POSITIVE_INFINITY;

  const tickets = (
    await deps.storage.transaction((tx) => tx.tickets.listByStatus('verifying'))
  ).sort((a, b) => ticketNumber(a.id) - ticketNumber(b.id));

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
