/**
 * Refresh: what a settled run means for its ticket.
 *
 * Why: a run's result is a fact; the ticket's next state is a decision. Success moves the
 *   ticket to Verifying; a pause means the Worker asked a human, so the ticket parks in
 *   WaitingHuman with the interaction as its durable reason (director-core.md §8); a
 *   failure is either retried later through a wake or handed to a human, by the family
 *   table and the hourly re-wake cap (execution-plane.md §8). A run that ended out of quota
 *   is neither: it parks its harness until the reset and the ticket waits (tick/quota, d-0097).
 *   Every ticket change goes
 *   through `transition()`; nothing here writes a status directly, and a run that is no
 *   longer the ticket's current run (a late settle) changes nothing.
 *
 * Exports: applyOutcome().
 * Depends on: @forge/core (isRunActive, TERMINAL_STATUSES), domain/failure-policy,
 *   tick/quota, tick/ticket-moves, tick/wakes. Writes inside the caller's transaction.
 */

import { InteractionKind, TERMINAL_STATUSES, isRunActive } from '@forge/core';
import type { ErrorFamily, Run, RunResult, StorageTx, Ticket } from '@forge/core';
import { decideFailure } from '#/domain/failure-policy.js';
import { iso } from '#/shared/time.js';
import { parkHarnessForQuota, requestQuotaWake } from '#/tick/quota.js';
import { moveTicketTx, parkPlan } from '#/tick/ticket-moves.js';
import { requestWakeTx } from '#/tick/wakes.js';
import type { EngineCtx, Pump } from '#/types/engine-state.types.js';

async function parkIn(
  ctx: EngineCtx,
  tx: StorageTx,
  ticket: Ticket,
  reason: string,
): Promise<void> {
  const moved = await moveTicketTx(tx, ticket.id, ctx.nowIso, (t) => parkPlan(t, reason));
  if (moved.ok) {
    ctx.report.parked.push({ ticketId: ticket.id, reason });
  } else {
    ctx.deps.log?.('error', `could not park ${ticket.id}`, { reason: moved.reason });
  }
}

/** Creates the interaction a pause points at when the Worker side did not write it. */
async function ensureInteraction(
  ctx: EngineCtx,
  tx: StorageTx,
  run: Run,
  id: string,
  pump?: Pump,
): Promise<void> {
  if (await tx.interactions.get(id)) {
    return;
  }

  const ask = pump?.asks.get(id);
  const kind = InteractionKind.safeParse(ask?.kind);
  await tx.interactions.insert({
    id,
    ticket_id: run.ticket_id,
    run_id: run.id,
    kind: kind.success ? kind.data : 'question',
    payload: { prompt: ask?.prompt ?? '(the Worker paused without a recorded question)' },
    status: 'pending',
    asked_at: ctx.nowIso,
    timeout_at: iso(ctx.now + ctx.config.forge.engine.interaction_timeout_ms),
  });
}

/** Applies the ticket effect of `run` ending with `result` (family already resolved); inside `tx`. */
export async function applyOutcome(
  ctx: EngineCtx,
  tx: StorageTx,
  run: Run,
  result: RunResult,
  family: ErrorFamily | undefined,
  pump?: Pump,
): Promise<void> {
  const ticket = await tx.tickets.get(run.ticket_id as Ticket['id']);
  if (!ticket || TERMINAL_STATUSES.includes(ticket.status) || pump?.cancelled) {
    return;
  }

  const current = ticket.assignee_run_id
    ? await tx.runs.get(ticket.assignee_run_id)
    : null;

  if (current && current.id !== run.id && isRunActive(current)) {
    return;
  }

  const { log } = ctx.deps;
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
    await ensureInteraction(ctx, tx, run, result.interactionId, pump);
    const m = await moveTicketTx(tx, ticket.id, ctx.nowIso, () => ({
      events: [{ type: 'asked' }],
    }));

    if (!m.ok) {
      log?.('warn', 'pause did not park the ticket', { reason: m.reason });
    }

    return;
  }

  if (family === 'quota') {
    const until = await parkHarnessForQuota(ctx, tx, run, result);
    await requestQuotaWake(ctx, tx, ticket, run, until);

    return;
  }

  const failed = family === undefined ? [] : await tx.runs.listByTicket(ticket.id);
  const attempts = failed.filter((r) => r.error_family === family).length;
  const decision = decideFailure({
    status: result.status,
    ...(family ? { family } : {}),
    attempts: Math.max(1, attempts),
    ...(result.retryNotBefore ? { retryNotBefore: result.retryNotBefore } : {}),
    now: ctx.now,
    policy: ctx.config.forge.engine.retry,
  });

  if (decision.action === 'park') {
    return parkIn(ctx, tx, ticket, decision.reason);
  }

  const wake = await requestWakeTx(
    tx,
    ctx.deps,
    {
      ticketId: ticket.id,
      kind: 'retry',
      reason: decision.family,
      key: run.id,
      notBefore: decision.notBefore,
    },
    ctx.config.forge.engine.rewake_cap,
  );

  if (wake.capped) {
    const cap = ctx.config.forge.engine.rewake_cap;
    await parkIn(
      ctx,
      tx,
      ticket,
      `re-wake cap (${cap.max} per hour) reached after ${decision.family}; needs a human`,
    );
  }
}
