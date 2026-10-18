/**
 * Refresh: what a settled run means for its ticket.
 *
 * Why: a run's result is a fact; the ticket's next state is a decision. Success moves the
 *   ticket to Verifying; a pause means the Worker asked a human, so the ticket parks in
 *   WaitingHuman with the interaction as its durable reason (director-core.md §8); a
 *   failure is either retried later through a wake or handed to a human, by the family
 *   table and the hourly re-wake cap (execution-plane.md §8). A run that ended out of quota
 *   is neither: it parks its harness until the reset and the ticket waits (tick/quota, d-0097).
 *   A stage whose agent is rate-limited past its retries, or whose model the harness cannot serve, moves to the
 *   next place on the agent's own fallback list; with none left it parks as `no_agent_available` (tick/agent-fallback).
 *   A run that carries a pipeline stage is applied by tick/stage-outcome: a writer passes its stage
 *   and the cursor says what is next, a check applies the review it submitted.
 *   Every ticket change goes
 *   through `transition()`; nothing here writes a status directly, and a run that is no
 *   longer the ticket's current run (a late settle) changes nothing. A pause and a park each
 *   leave one escalation behind (a typed question, a failure, or a setup when a login or a tool
 *   approval is what a retry cannot fix), so the owner always has something to act on
 *   (tick/outcome-escalate).
 *
 * Exports: applyOutcome().
 * Depends on: @forge/core (isRunActive, TERMINAL_STATUSES), domain/failure-policy, tick/{agent-fallback,no-agent},
 *   tick/outcome-escalate, tick/quota, tick/stage-{outcome,records,state}, tick/ticket-moves, tick/wakes.
 *   Writes inside the caller's transaction.
 */

import { TERMINAL_STATUSES, isRunActive } from '@forge/core';
import type { ErrorFamily, Run, RunResult, StorageTx, Ticket } from '@forge/core';
import { decideFailure } from '#/domain/failure-policy.js';
import { nextSlotTx } from '#/tick/agent-fallback.js';
import { parkNoAgent } from '#/tick/no-agent.js';
import { ensureQuestion, parkRun, setupCauseOfRun } from '#/tick/outcome-escalate.js';
import { parkHarnessForQuota, requestQuotaWake } from '#/tick/quota.js';
import { afterWriterSuccessTx, applyCheckOutcome } from '#/tick/stage-outcome.js';
import { finishStageRun } from '#/tick/stage-records.js';
import { isCheckRow, readStageState } from '#/tick/stage-state.js';
import { moveTicketTx } from '#/tick/ticket-moves.js';
import { requestWakeTx } from '#/tick/wakes.js';
import type { EngineCtx, Pump } from '#/types/engine-state.types.js';
import type { SettleOptions } from '#/types/tick.types.js';

/**
 * Applies the ticket effect of `run` ending with `result` (family already resolved); inside
 * `tx`. `opts.retryReason` names the retry wake when the cause is not the family itself (an
 * interrupted run that could not be resumed wakes with `resume_failed`); `opts.parkReason` is
 * what a parking failure tells the owner when the family's generic text would hide the cause,
 * and `opts.parkBuild` marks it as a harness build that changed under the approvals (a setup
 * for the owner, not a failure).
 */
export async function applyOutcome(
  ctx: EngineCtx,
  tx: StorageTx,
  run: Run,
  result: RunResult,
  family: ErrorFamily | undefined,
  pump?: Pump,
  opts: Pick<
    SettleOptions,
    'retryReason' | 'parkReason' | 'parkBuild' | 'receipts' | 'diff'
  > = {},
): Promise<void> {
  const ticket = await tx.tickets.get(run.ticket_id as Ticket['id']);
  if (!ticket || TERMINAL_STATUSES.includes(ticket.status) || pump?.cancelled) {
    return;
  }

  const current = ticket.assignee_run_id
    ? await tx.runs.get(ticket.assignee_run_id)
    : null;

  // A run that carries a pipeline stage: a check applies its verdict, a writer passes its stage
  // and the cursor says what is next. A run with no stage row (from before pipelines) is the old path.
  const row = await tx.stageRuns.getByRun(run.id);
  const staged = row ? await readStageState(tx, ticket.id) : null;
  // A member of a writer group runs beside its siblings: only the newest is the assignee, and the
  // settle of the others must not be taken for a late result of a run that was replaced.
  const parallel =
    row !== null &&
    staged !== null &&
    row.kind === 'agent' &&
    row.member_id !== '' &&
    !isCheckRow(staged.snapshot, row);

  if (current && current.id !== run.id && isRunActive(current) && !parallel) {
    return;
  }

  const { log } = ctx.deps;
  if (row && staged) {
    if (isCheckRow(staged.snapshot, row)) {
      return applyCheckOutcome(ctx, tx, ticket, run, result, family, row, staged);
    }

    if (result.status === 'success') {
      return afterWriterSuccessTx(ctx, tx, ticket, run, row, staged.snapshot, opts);
    }
  }

  if (result.status === 'success') {
    const m = await moveTicketTx(tx, ticket.id, ctx.nowIso, () => ({
      events: [{ type: 'verifying' }],
    }));

    if (!m.ok) {
      log?.('warn', 'success did not move the ticket', { reason: m.reason });
    }

    return;
  }

  if (result.status === 'paused' && result.interactionId) {
    await ensureQuestion(ctx, tx, run, result.interactionId, pump);
    const m = await moveTicketTx(tx, ticket.id, ctx.nowIso, () => ({
      events: [{ type: 'asked' }],
    }));

    if (!m.ok) {
      log?.('warn', 'pause did not park the ticket', { reason: m.reason });
    }

    return;
  }

  if (row && staged) {
    // The writer's attempt stays open for the retry (dispatch takes it over), marked as an error.
    await finishStageRun(
      tx,
      row.id,
      'error',
      {
        // The entry of the agent's chain the attempt is on survives the failure, so the next step knows what was tried.
        ...(row.outcome.fallback === undefined ? {} : { fallback: row.outcome.fallback }),
        note: family ?? result.status,
      },
      ctx.nowIso,
    );
  }

  if (family === 'quota') {
    const until = await parkHarnessForQuota(ctx, tx, run, result);
    await requestQuotaWake(ctx, tx, ticket, run, until);

    return;
  }

  // The retries of one place of the agent's chain are counted apart from another's (fallback_slot, 0 for runs before slots).
  const failed = family === undefined ? [] : await tx.runs.listByTicket(ticket.id);
  const attempts = failed.filter(
    (r) =>
      r.error_family === family && (r.fallback_slot ?? 0) === (run.fallback_slot ?? 0),
  ).length;

  const decision = decideFailure({
    status: result.status,
    ...(family ? { family } : {}),
    attempts: Math.max(1, attempts),
    ...(result.retryNotBefore ? { retryNotBefore: result.retryNotBefore } : {}),
    now: ctx.now,
    policy: ctx.config.forge.engine.retry,
  });

  if (decision.action === 'park') {
    // A stage whose agent keeps being rate-limited, or whose model is gone, moves to the next place on the
    // agent's own list before anyone is asked; with none left the ticket parks as `no_agent_available`.
    if (row && staged && (family === 'rate_limit' || family === 'model_unavailable')) {
      const open = (await tx.stageRuns.get(row.id)) ?? row;
      const move = await nextSlotTx(ctx, tx, ticket, run, open, family);
      if (move.kind === 'moved') {
        return;
      }

      return parkNoAgent(
        ctx,
        tx,
        ticket,
        run,
        family,
        move,
        row.agent_id ?? run.agent_id ?? 'the agent',
      );
    }

    return parkRun(
      ctx,
      tx,
      ticket,
      run,
      opts.parkReason ?? decision.reason,
      family,
      await setupCauseOfRun(ctx, tx, run, family, opts.parkBuild, opts.receipts),
    );
  }

  const wake = await requestWakeTx(
    tx,
    ctx.deps,
    {
      ticketId: ticket.id,
      kind: 'retry',
      reason: opts.retryReason ?? decision.family,
      key: run.id,
      notBefore: decision.notBefore,
    },
    ctx.config.forge.engine.rewake_cap,
  );

  if (wake.capped) {
    const cap = ctx.config.forge.engine.rewake_cap;
    await parkRun(
      ctx,
      tx,
      ticket,
      run,
      `re-wake cap (${cap.max} per hour) reached after ${decision.family}; needs a human`,
      family,
      null,
    );
  }
}
