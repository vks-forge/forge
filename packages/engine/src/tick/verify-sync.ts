/**
 * Verify sync: bring main into the ticket's branch before it is gated, and route a clash to its writer.
 *
 * Why: tickets run side by side, so by the time one is verified main has often moved. Nothing used to
 *   bring main into a branch: an unmergeable PR was refused as a policy denial, Retry re-parked it in
 *   one tick with no Worker, and the only way out was re-planning the card (eval fix 4). Now every
 *   verify cycle commits the run's work, asks the host for the base tip and merges it into the branch
 *   inside its worktree (a merge, never a rebase: no force push, the PR updates by a normal push, d-0012).
 *   Nothing new, or a clean merge, goes on to publish and gate the merged head. A clash is already
 *   committed with markers in the files by the git adapter, so it is durable; the ticket moves back to
 *   `in_progress` through `conflict_found` and its writer (the stage's `rework_to`) is woken with the
 *   files and the upstream tickets' titles. That road has its own cap (two resolves, then a failure
 *   escalation with the clash attached) and spends no gate rework. A resolver that leaves markers behind
 *   fails G1 with the marker check; verify routes that failure here too, so it counts as the same clash.
 *   Never runs inside a Worker's tree (d-0110): only on a ticket that is already Verifying.
 *
 * Exports: syncBaseIntoBranch(), routeConflict(), g1StageId().
 * Depends on: @forge/core (MAX_CONFLICT_RESOLVES), domain/conflict-wake, tick/{base-sync,card-log,
 *   conflict-context,rework-wakes,stage-send-back,ticket-moves,verify-outcomes}.
 *   IO through the git ports and storage.
 */

import { MAX_CONFLICT_RESOLVES } from '@forge/core';
import { conflictPayload, conflictWakeReason } from '#/domain/conflict-wake.js';
import type { ConflictInfo } from '#/schemas/conflict.js';
import { baseTipFor } from '#/tick/base-sync.js';
import { ENGINE_ACTOR, logCardEvent } from '#/tick/card-log.js';
import { buildConflictInfo, clashNote } from '#/tick/conflict-context.js';
import { requestReworkWakesTx } from '#/tick/rework-wakes.js';
import { closeStage } from '#/tick/stage-send-back.js';
import { moveTicketTx } from '#/tick/ticket-moves.js';
import { raiseFailure, recordVerified } from '#/tick/verify-outcomes.js';
import type { EngineCtx } from '#/types/engine-state.types.js';
import type { BaseSync, VerifyTarget } from '#/types/verify.types.js';

/** The id of the ticket's G1 stage (the one a failed gate or a clash ends the cycle at). */
export async function g1StageId(ctx: EngineCtx, ticketId: string): Promise<string> {
  const snapshot = await ctx.deps.storage.transaction((tx) =>
    tx.ticketPipelines.get(ticketId),
  );

  const g1 = snapshot?.definition.stages.find(
    (s) => s.kind === 'script_gate' && 'builtin' in s.run,
  );

  return g1?.id ?? 'g1';
}

/**
 * Sends a clash to the ticket's writer: `conflict_found` through the state machine, the G1 stage's
 * attempt closed as failed (which ends the cycle so the next one restarts at the writer), and one
 * continuation wake carrying the clash. At the cap the ticket waits for the owner with a
 * `merge_conflict` failure that names the files and upstream tickets.
 */
export async function routeConflict(
  ctx: EngineCtx,
  t: VerifyTarget,
  info: ConflictInfo,
): Promise<void> {
  const stageId = await g1StageId(ctx, t.ticket.id);
  const files = info.files.map((f) => f.path);
  const note = clashNote(t.ticket.id, info);
  await ctx.deps.storage.transaction(async (tx) => {
    const moved = await moveTicketTx(tx, t.ticket.id, ctx.nowIso, (cur) =>
      cur.status === 'verifying' ? { events: [{ type: 'conflict_found', files }] } : null,
    );

    if (!moved.ok) {
      ctx.deps.log?.('error', `could not apply conflict_found to ${t.ticket.id}`, {
        reason: moved.reason,
      });

      return;
    }

    await closeStage(
      tx,
      ctx,
      t,
      {
        stage: { id: stageId, member: '', kind: 'script_gate' },
        klass: 'gate',
        policy: 'rework',
        label: 'merge with main',
        findings: note,
        outcome: { gate: { status: 'failed' } },
      },
      'failed',
    );

    if (moved.ticket.status === 'in_progress') {
      await requestReworkWakesTx(
        ctx.deps,
        tx,
        t.ticket.id,
        stageId,
        conflictWakeReason(info),
        t.run.id,
      );

      await logCardEvent(tx, t.ticket.card_id, {
        kind: 'note',
        at: ctx.nowIso,
        actor: ENGINE_ACTOR,
        payload: { text: note },
      });

      recordVerified(ctx, t, 'rework', [], { detail: note });

      return;
    }

    const reason =
      moved.ticket.blocked_reason ??
      `merge conflict: still clashing after ${MAX_CONFLICT_RESOLVES} automatic resolves; needs you`;

    await raiseFailure(ctx, tx, moved.ticket, reason, 'merge_conflict', {
      cause: 'merge_conflict',
      conflict: conflictPayload(info),
    });

    ctx.report.parked.push({ ticketId: t.ticket.id, reason });
    recordVerified(ctx, t, 'parked', [], {
      detail: reason,
      errorFamily: 'merge_conflict',
    });
  });
}

/**
 * Asks the host for the base tip and merges it into the branch (the caller committed the run's work
 * first: the merge needs a clean tree). `ready` means the branch holds the base tip now (it did, or
 * the merge was clean) and can be published and gated from the returned base; `handled` means a clash was routed to the
 * writer (or the owner) and verify is done with this ticket for the tick.
 */
export async function syncBaseIntoBranch(
  ctx: EngineCtx,
  t: VerifyTarget,
): Promise<BaseSync> {
  const tip = await baseTipFor(ctx, t.project.slug, t.runtime.gitHost);
  const result = await t.runtime.worktrees.mergeIn(
    t.worktree,
    tip.sha,
    `Merge ${t.baseRef} into ${t.branch}`,
  );

  if (result.kind === 'up_to_date') {
    return { kind: 'ready', baseSha: t.baseSha };
  }

  if (result.kind === 'merged') {
    ctx.deps.log?.('info', `${t.ticket.id}: merged ${t.baseRef} into the branch`, {
      head: result.head,
    });

    await ctx.deps.storage.transaction((tx) =>
      logCardEvent(tx, t.ticket.card_id, {
        kind: 'note',
        at: ctx.nowIso,
        actor: ENGINE_ACTOR,
        payload: {
          text: `Main moved; Forge merged it into ${t.ticket.id} and is re-checking.`,
        },
      }),
    );

    // The merge base moved to the tip: what main brought in is not the Worker's change, so the gates
    // must diff from it or they would blame the Worker for the user's own commits.
    return { kind: 'ready', baseSha: tip.sha };
  }

  await routeConflict(
    ctx,
    t,
    await buildConflictInfo(ctx, t, result.files, result.upstream),
  );

  return { kind: 'handled' };
}
