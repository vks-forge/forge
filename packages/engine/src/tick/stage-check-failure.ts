/**
 * A check that failed to produce a verdict: retried, moved to the agent's next place, or parked.
 *
 * Why: a reviewer or critic run can end with no review at all (it crashed, was rate-limited, stopped to ask a
 *   question, never called `submit_review`). That is never a pass and never a finding: the attempt is an error,
 *   and what happens next is bounded by its error family like any run: a quota stop parks the harness until its
 *   reset, a rate limit past its retries (or a model the harness cannot serve) moves the check to the next place on
 *   its agent's own list, and only when none is left does the ticket park as `no_agent_available`; anything else
 *   retries by the family table and then parks for the owner. The place the attempt is on survives on its stage row
 *   so the next step knows what was tried.
 *
 * Exports: checkNotCompleted().
 * Depends on: @forge/core (ErrorFamily, Run, RunResult, StageRun), domain/failure-policy, tick/{agent-fallback,
 *   quota,stage-records,verify-outcomes}. Writes inside the caller's transaction.
 */

import type {
  ErrorFamily,
  Run,
  RunResult,
  StageRun,
  StorageTx,
  Ticket,
} from '@forge/core';
import { decideFailure } from '#/domain/failure-policy.js';
import { nextSlotTx } from '#/tick/agent-fallback.js';
import { noAgentReason, raiseNoAgent } from '#/tick/no-agent.js';
import { parkHarnessForQuota } from '#/tick/quota.js';
import { finishStageRun, requestStageWake } from '#/tick/stage-records.js';
import { parkVerifyingTx } from '#/tick/verify-outcomes.js';
import type { EngineCtx } from '#/types/engine-state.types.js';

/**
 * A check attempt failed to produce a verdict: no review, a crash, a quota stop. It is retried or
 * parked bounded by the family, never counted as a pass.
 */
export async function checkNotCompleted(
  ctx: EngineCtx,
  tx: StorageTx,
  ticket: Ticket,
  writer: Run,
  run: Run,
  row: StageRun,
  result: RunResult,
  family: ErrorFamily | undefined,
  why: string,
): Promise<void> {
  await finishStageRun(
    tx,
    row.id,
    'error',
    {
      // The entry of the agent's chain the attempt is on survives the failure (see tick/agent-fallback).
      ...(row.outcome.fallback === undefined ? {} : { fallback: row.outcome.fallback }),
      note: why.slice(0, 1000),
    },
    ctx.nowIso,
  );

  if (family === 'quota') {
    const until = await parkHarnessForQuota(ctx, tx, run, result);
    await requestStageWake(
      ctx,
      tx,
      ticket.id,
      row.stage_id,
      row.cycle,
      'stage:quota',
      until,
      row.member_id,
    );

    return;
  }

  const failed = family === undefined ? [] : await tx.runs.listByTicket(ticket.id);
  const attempts = failed.filter(
    (r) =>
      r.error_family === family && (r.fallback_slot ?? 0) === (run.fallback_slot ?? 0),
  ).length;

  const decision =
    family === undefined
      ? ({ action: 'park', reason: why } as const)
      : decideFailure({
          status: result.status,
          family,
          attempts: Math.max(1, attempts),
          ...(result.retryNotBefore ? { retryNotBefore: result.retryNotBefore } : {}),
          now: ctx.now,
          policy: ctx.config.forge.engine.retry,
        });

  if (
    decision.action === 'park' &&
    (family === 'rate_limit' || family === 'model_unavailable')
  ) {
    // The check's agent moves to the next place on its own list; with none left the ticket parks as no_agent_available.
    const open = (await tx.stageRuns.get(row.id)) ?? row;
    const move = await nextSlotTx(ctx, tx, ticket, run, open, family);
    if (move.kind === 'moved') {
      return;
    }

    const reason = noAgentReason(row.agent_id ?? 'the agent', family, move);
    await parkVerifyingTx(
      ctx,
      tx,
      { ticket, run: writer },
      reason,
      [],
      family,
      undefined,
      (t, parked) => raiseNoAgent(ctx, t, parked, run.id, reason, family, move),
    );

    return;
  }

  if (decision.action === 'park') {
    await parkVerifyingTx(
      ctx,
      tx,
      { ticket, run: writer },
      `a check could not finish: ${why}; needs you`,
      [],
      family,
    );

    return;
  }

  await requestStageWake(
    ctx,
    tx,
    ticket.id,
    row.stage_id,
    row.cycle,
    `stage:retry:${decision.family}`,
    decision.notBefore,
    row.member_id,
  );
}
