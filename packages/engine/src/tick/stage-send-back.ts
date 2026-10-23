/**
 * Send back: what happens when a stage stops the merge.
 *
 * Why: a failed gate, a failed script and a reviewer's blocking findings are the same kind of
 *   event and take the same bounded road (d-0152): the stage's attempt is recorded as failed,
 *   which ends the rework cycle; `gate_failed` moves the ticket back to In Progress (the state
 *   machine's cap of two automatic reworks, then a human); and the findings travel in the
 *   continuation wake, so the next Worker prompt carries them even if the server restarts in
 *   between. The next cycle restarts at the stage's `rework_to` (the last writer by default),
 *   so the test-writer is not run again when only the implementation is wrong. Which road a
 *   blocking result takes is `blockingRoute`'s call: a gate always reworks and ends at the
 *   `rework_cap` failure (never "merge anyway"); a reviewer's or critic's findings, or the
 *   Director check's, rework while reworks remain and then hold, and a stage set to hold holds at
 *   once. A hold parks the ticket from Verifying (its attempt is recorded as waiting) with one
 *   `decision` item for the owner (Merge anyway, Send back, Re-plan, Cancel), which neither spends
 *   a rework nor loses the finished work. Each door has a `Tx` form because a settled check run
 *   applies its verdict inside the settle transaction.
 *
 * Config-only G1 failures hold for the owner as a `config_hold` decision (d-0173); a G1 failure that is only
 * the lost proof of an earlier run reworks while the cap allows and then holds as a `provenance_hold` (F-D3).
 *
 * Exports: sendBackTx(), sendBack(), routeBlockedTx(), holdForOwnerTx(), holdGateTx(), reworkOrPark(), closeStage(), clip().
 * Depends on: @forge/core (MAX_AUTO_REWORKS, blockingRoute, currentCycle), domain/gate-rows, tick/gate-hold, tick/escalation-finished,
 *   tick/stage-records, tick/ticket-moves, tick/verify-outcomes, tick/rework-wakes, types/stage-runner.
 */

import { MAX_AUTO_REWORKS, blockingRoute, currentCycle } from '@forge/core';
import type { GateVerdict, StorageTx } from '@forge/core';
import { describeFailures } from '#/domain/gate-rows.js';
import { raiseDecisionTx } from '#/tick/escalation-finished.js';
import { finishStageRun, recordStage } from '#/tick/stage-records.js';
import { gateHoldFields } from '#/tick/gate-hold.js';
import { moveTicketTx } from '#/tick/ticket-moves.js';
import { parkVerifyingTx, raiseFailure, recordVerified } from '#/tick/verify-outcomes.js';
import { requestReworkWakesTx } from '#/tick/rework-wakes.js';
import type { EngineCtx } from '#/types/engine-state.types.js';
import type { SendBackArgs, StageTarget } from '#/types/stage-runner.types.js';
import type { GateRows } from '#/types/verify.types.js';

/** A decision card carries at most this many blocking findings. */
const MAX_DECISION_FINDINGS = 20;

/** The longest findings text a wake carries. */
const MAX_FINDINGS = 6000;

/** `text` cut to the wake's limit. */
export const clip = (text: string): string =>
  text.length > MAX_FINDINGS ? `${text.slice(0, MAX_FINDINGS)}\n...(truncated)` : text;

/** Writes the stage's attempt as `status`: finishes its open row, or records one. */
export async function closeStage(
  tx: StorageTx,
  ctx: EngineCtx,
  t: StageTarget,
  a: SendBackArgs,
  status: 'failed' | 'waiting',
): Promise<void> {
  if (a.rowId !== undefined) {
    await finishStageRun(tx, a.rowId, status, a.outcome, ctx.nowIso);

    return;
  }

  const cycle = currentCycle(await tx.stageRuns.listByTicket(t.ticket.id));
  await recordStage(
    tx,
    ctx.nowIso,
    {
      ticket_id: t.ticket.id,
      stage_id: a.stage.id,
      member_id: a.stage.member,
      cycle,
      kind: a.stage.kind,
      run_id: t.run.id,
      ...(a.agent ? { agent_id: a.agent.id } : {}),
      ...(a.agent?.hash === undefined ? {} : { agent_hash: a.agent.hash }),
    },
    status,
    a.outcome,
  );
}

/**
 * A failed stage inside `tx`: send the Worker back with the findings, or park at the rework cap.
 * False when the ticket could not take `gate_failed` (it was not verifying).
 */
export async function sendBackTx(
  ctx: EngineCtx,
  tx: StorageTx,
  t: StageTarget,
  a: SendBackArgs,
): Promise<boolean> {
  const { deps } = ctx;
  const findings = clip(a.findings);
  const rows = a.rows ?? [];
  const moved = await moveTicketTx(tx, t.ticket.id, ctx.nowIso, (cur) =>
    cur.status === 'verifying' ? { events: [{ type: 'gate_failed' }] } : null,
  );

  if (!moved.ok) {
    deps.log?.('error', `could not apply gate_failed to ${t.ticket.id}`, {
      reason: moved.reason,
    });

    return false;
  }

  await closeStage(tx, ctx, t, a, 'failed');
  if (moved.ticket.status === 'in_progress') {
    // The findings travel in the wake's reason, which is durable: the next run's prompt
    // is built from it even if the server restarts in between.
    await requestReworkWakesTx(
      deps,
      tx,
      t.ticket.id,
      a.stage.id,
      `gate_failed: ${findings}`,
      t.run.id,
    );

    recordVerified(ctx, t, 'rework', rows, { detail: findings });

    return true;
  }

  const reason = `gate ${a.label} failed after ${MAX_AUTO_REWORKS} automatic reworks; needs you. ${findings}`;
  const parked = await moveTicketTx(tx, t.ticket.id, ctx.nowIso, (cur) =>
    cur.status === 'waiting_human'
      ? { events: [], fields: { blocked_reason: reason } }
      : null,
  );

  if (parked.ok) {
    await raiseFailure(ctx, tx, parked.ticket, reason);
  }

  ctx.report.parked.push({ ticketId: t.ticket.id, reason });
  recordVerified(ctx, t, 'parked', rows, { detail: reason });

  return true;
}

/** {@link sendBackTx} in its own transaction. */
export async function sendBack(
  ctx: EngineCtx,
  t: StageTarget,
  a: SendBackArgs,
): Promise<void> {
  await ctx.deps.storage.transaction((tx) => sendBackTx(ctx, tx, t, a));
}

/**
 * A hold for the owner, inside `tx`: the stage's attempt is `waiting`, the ticket parks from
 * Verifying and one `findings_hold` decision (the blocking findings, the rework count) is raised.
 */
export async function holdForOwnerTx(
  ctx: EngineCtx,
  tx: StorageTx,
  t: StageTarget,
  a: SendBackArgs,
): Promise<boolean> {
  const count =
    (await tx.tickets.get(t.ticket.id))?.rework_count ?? t.ticket.rework_count;

  return raiseDecisionTx(
    ctx,
    tx,
    t,
    {
      kind: 'decision',
      cause: a.gateHold?.cause ?? 'findings_hold',
      summary:
        a.gateHold?.summary ??
        `${a.label} found blocking findings and holds the merge for you. ${clip(a.findings)}`,
      stage_id: a.stage.id,
      stage_label: a.label,
      findings: [...(a.blocking ?? [])].slice(0, MAX_DECISION_FINDINGS),
      rework: { count, cap: MAX_AUTO_REWORKS },
    },
    a.rows ?? [],
    (inner) => closeStage(inner, ctx, t, a, 'waiting'),
  );
}

/**
 * A script gate set to hold, inside `tx`: its attempt is `waiting` and the ticket parks from
 * Verifying with a plain failure (Retry runs the gate again). A gate is deterministic, so it never
 * offers "merge anyway": an owner who wants the work past it edits the gate in the pipeline.
 */
export async function holdGateTx(
  ctx: EngineCtx,
  tx: StorageTx,
  t: StageTarget,
  a: SendBackArgs,
): Promise<boolean> {
  const reason = `${a.label} found blocking findings and holds the merge for you. ${clip(a.findings)}`;

  return parkVerifyingTx(ctx, tx, t, reason, a.rows ?? [], undefined, (inner) =>
    closeStage(inner, ctx, t, a, 'waiting'),
  );
}

/**
 * Applies a blocking result by the road `blockingRoute` names: back for rework (a gate, at the cap,
 * ends in the `rework_cap` failure), or a hold for the owner. A script gate that says hold parks
 * as a plain failure. False when the ticket was not verifying.
 */
export async function routeBlockedTx(
  ctx: EngineCtx,
  tx: StorageTx,
  t: StageTarget,
  a: SendBackArgs,
): Promise<boolean> {
  const count =
    (await tx.tickets.get(t.ticket.id))?.rework_count ?? t.ticket.rework_count;

  const route = blockingRoute({
    klass: a.klass,
    policy: a.policy,
    reworkCount: count,
    cap: MAX_AUTO_REWORKS,
    ...(a.gateHold?.cause === 'config_hold' ? { configOnly: true } : {}),
    ...(a.gateHold?.cause === 'provenance_hold' ? { provenanceOnly: true } : {}),
  });

  if (route === 'hold') {
    return holdForOwnerTx(ctx, tx, t, a);
  }

  if (a.klass === 'gate' && a.policy === 'hold') {
    return holdGateTx(ctx, tx, t, a);
  }

  return sendBackTx(ctx, tx, t, a);
}

/**
 * A failed G1: send the Worker back with the gate findings, or park at the rework cap. A failure on
 * gate configuration alone is held for the owner instead, with no rework spent (d-0173); one that is only
 * a lost earlier-run proof is held once the reworks are spent (F-D3).
 */
export async function reworkOrPark(
  ctx: EngineCtx,
  t: StageTarget,
  rows: GateRows,
  verdicts: ReadonlyMap<string, GateVerdict>,
  g1StageId: string,
): Promise<void> {
  const names = rows
    .filter((r) => r.status === 'failed')
    .map((r) => r.gate)
    .join(', ');

  const failed = rows.find((r) => r.status === 'failed');
  const hold = gateHoldFields(rows, verdicts);

  await ctx.deps.storage.transaction((tx) =>
    routeBlockedTx(ctx, tx, t, {
      stage: { id: g1StageId, member: '', kind: 'script_gate' },
      klass: 'gate',
      policy: 'rework',
      label: names,
      findings: describeFailures(rows, verdicts),
      outcome: {
        gate: {
          status: 'failed',
          ...(failed?.report_ref ? { report_ref: failed.report_ref } : {}),
        },
      },
      rows,
      ...(hold
        ? {
            gateHold: { cause: hold.cause, files: hold.files, summary: hold.summary },
            blocking: hold.blocking,
          }
        : {}),
    }),
  );
}
