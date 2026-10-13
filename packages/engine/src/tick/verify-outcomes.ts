/**
 * What verify decides when it cannot merge: rework, park, or try again later.
 *
 * Why: a verify cycle that does not end in a merge ends in one of three ways, and each
 *   must be bounded. A failed gate sends the Worker back with the findings, but only twice
 *   (the state machine's cap), then a human decides. An infrastructure fault (the host
 *   refused a push, a gate could not run) is not the Worker's fault: transient families
 *   wait and retry under the same backoff and hourly re-wake cap as run failures, and the
 *   ones a retry cannot fix (auth, a merge conflict, a denied action) go straight to a
 *   human with the reason. Verifying has no legal move to WaitingHuman, so parking goes
 *   through `gate_failed` (and `parked`), still the one door `transition()`.
 *
 * Exports: recordVerified(), reworkOrPark(), parkVerifying(), handleVerifyFailure().
 * Depends on: @forge/core (MAX_AUTO_REWORKS), domain/{failure-policy,gate-rows,results},
 *   steps/run-step, tick/ticket-moves, tick/wakes.
 */

import { MAX_AUTO_REWORKS } from '@forge/core';
import type { GateVerdict } from '@forge/core';
import { decideFailure } from '#/domain/failure-policy.js';
import { describeFailures } from '#/domain/gate-rows.js';
import { familyOf } from '#/domain/results.js';
import { hold } from '#/steps/run-step.js';
import { moveTicket, moveTicketTx } from '#/tick/ticket-moves.js';
import { requestWakeTx } from '#/tick/wakes.js';
import type { EngineCtx } from '#/types/engine-state.types.js';
import type {
  GateRows,
  VerifiedTicket,
  VerifyOutcome,
  VerifyTarget,
} from '#/types/verify.types.js';

/** Adds one entry to `TickReport.verified`. */
export function recordVerified(
  ctx: EngineCtx,
  t: VerifyTarget,
  outcome: VerifyOutcome,
  rows: GateRows,
  extra: Partial<Pick<VerifiedTicket, 'detail' | 'errorFamily'>> = {},
): void {
  ctx.report.verified.push({
    ticketId: t.ticket.id,
    runId: t.run.id,
    outcome,
    gates: rows.map((r) => ({ gate: r.gate, status: r.status })),
    ...extra,
  });
}

/** Moves a Verifying ticket to WaitingHuman with `reason`, whatever its rework count. */
export async function parkVerifying(
  ctx: EngineCtx,
  t: VerifyTarget,
  reason: string,
  rows: GateRows = [],
  errorFamily?: VerifiedTicket['errorFamily'],
): Promise<void> {
  const moved = await moveTicket(ctx.deps.storage, t.ticket.id, ctx.nowIso, (cur) => {
    if (cur.status !== 'verifying') {
      return null;
    }

    // At the cap gate_failed itself lands in WaitingHuman; below it, it reopens the
    // ticket and `parked` closes it again with our reason.
    const atCap = cur.rework_count >= MAX_AUTO_REWORKS;

    return {
      events: atCap
        ? [{ type: 'gate_failed' }]
        : [{ type: 'gate_failed' }, { type: 'parked', reason }],
      fields: { blocked_reason: reason },
    };
  });

  if (!moved.ok) {
    ctx.deps.log?.('error', `could not park ${t.ticket.id}`, { reason: moved.reason });

    return;
  }

  ctx.report.parked.push({ ticketId: t.ticket.id, reason });
  recordVerified(ctx, t, 'parked', rows, {
    detail: reason,
    ...(errorFamily ? { errorFamily } : {}),
  });
}

/** A failed gate: send the Worker back with the findings, or park at the rework cap. */
export async function reworkOrPark(
  ctx: EngineCtx,
  t: VerifyTarget,
  rows: GateRows,
  verdicts: ReadonlyMap<string, GateVerdict>,
): Promise<void> {
  const findings = describeFailures(rows, verdicts);
  const names = rows
    .filter((r) => r.status === 'failed')
    .map((r) => r.gate)
    .join(', ');

  const { deps } = ctx;
  const outcome = await deps.storage.transaction(async (tx) => {
    const moved = await moveTicketTx(tx, t.ticket.id, ctx.nowIso, (cur) =>
      cur.status === 'verifying' ? { events: [{ type: 'gate_failed' }] } : null,
    );

    if (!moved.ok || moved.ticket.status !== 'in_progress') {
      return moved;
    }

    // The findings travel in the wake's reason, which is durable: the next run's prompt
    // is built from it even if the server restarts in between.
    await requestWakeTx(tx, deps, {
      ticketId: t.ticket.id,
      kind: 'continuation',
      reason: `gate_failed: ${findings}`,
      key: t.run.id,
    });

    return moved;
  });

  if (!outcome.ok) {
    deps.log?.('error', `could not apply gate_failed to ${t.ticket.id}`, {
      reason: outcome.reason,
    });

    return;
  }

  if (outcome.ticket.status === 'in_progress') {
    recordVerified(ctx, t, 'rework', rows, { detail: findings });

    return;
  }

  const reason = `gate ${names} failed after ${MAX_AUTO_REWORKS} automatic reworks; needs you. ${findings}`;
  await moveTicket(deps.storage, t.ticket.id, ctx.nowIso, (cur) =>
    cur.status === 'waiting_human'
      ? { events: [], fields: { blocked_reason: reason } }
      : null,
  );

  ctx.report.parked.push({ ticketId: t.ticket.id, reason });
  recordVerified(ctx, t, 'parked', rows, { detail: reason });
}

/** An infrastructure fault during verify: retry later by family and cap, or park for a human. */
export async function handleVerifyFailure(
  ctx: EngineCtx,
  t: VerifyTarget,
  error: unknown,
): Promise<void> {
  const { deps } = ctx;
  const family = familyOf(error);
  const message = error instanceof Error ? error.message : String(error);
  deps.log?.('warn', `verify of ${t.ticket.id} failed (${family})`, { error: message });

  const { window_ms: windowMs, max } = deps.config.engine.rewake_cap;
  const recent = await deps.storage.transaction((tx) =>
    tx.wakeRequests.countSince(t.ticket.id, new Date(ctx.now - windowMs).toISOString(), [
      'retry',
    ]),
  );

  const decision = decideFailure({
    status: 'error',
    family,
    attempts: recent + 1,
    now: ctx.now,
    policy: deps.config.engine.retry,
  });

  if (decision.action === 'park') {
    return parkVerifying(ctx, t, `verify: ${decision.reason} (${message})`, [], family);
  }

  // The wake row only counts toward the hourly cap; verify retries itself through a hold,
  // so the row is consumed at once and dispatch never sees it.
  const capped = await deps.storage.transaction(async (tx) => {
    const wake = await requestWakeTx(tx, deps, {
      ticketId: t.ticket.id,
      kind: 'retry',
      reason: `verify:${family}`,
      key: `verify:${t.run.id}:${recent + 1}`,
      notBefore: decision.notBefore,
    });

    if (wake.wake) {
      await tx.wakeRequests.markConsumed(wake.wake.id, ctx.nowIso);
    }

    return wake.capped;
  });

  if (capped) {
    return parkVerifying(
      ctx,
      t,
      `verify: re-wake cap (${max} per hour) reached after ${family}; needs a human (${message})`,
      [],
      family,
    );
  }

  hold(ctx, `verify:${t.ticket.id}`, decision.notBefore);
  recordVerified(ctx, t, 'retry_scheduled', [], { detail: message, errorFamily: family });
}
