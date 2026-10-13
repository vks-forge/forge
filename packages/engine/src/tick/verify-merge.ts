/**
 * Merge door: record the pass, decide the tier, and merge only tier A.
 *
 * Why: merging is the one irreversible step, so it has exactly one entry. This file is
 *   the only caller of `GitHost.merge`, and it gets there only for a ticket the state
 *   machine holds in Verifying with `tier_actual = A`, which only a `gate_passed` event
 *   can set. The tier comes from the real diff against the project's tier-C globs, not from
 *   the triage guess. Tier B and C stop in Review / NeedsSignoff for a human. The merge is
 *   resumable: if the server died after the host merged but before the ticket moved, the
 *   PR already reads as merged and only the ticket event is missing. Cleanup after Done is
 *   best effort and never undoes the merge.
 *
 * Exports: passAndMerge().
 * Depends on: @forge/core (PolicyDeniedError), domain/tier-actual, tick/ticket-moves,
 *   tick/verify-outcomes. IO only through GitHost and worktree ports.
 */

import { PolicyDeniedError } from '@forge/core';
import type { Ticket, Tier } from '@forge/core';
import { computeTierActual } from '#/domain/tier-actual.js';
import { moveTicket } from '#/tick/ticket-moves.js';
import { recordVerified } from '#/tick/verify-outcomes.js';
import type { EngineCtx } from '#/types/engine-state.types.js';
import type { GateRows, VerifyTarget } from '#/types/verify.types.js';

/** Records `gate_passed` with the tier the diff implies (once per cycle). */
async function recordPass(ctx: EngineCtx, t: VerifyTarget): Promise<Ticket> {
  const { deps } = ctx;
  const diff = await deps.worktrees.diff(t.worktree, t.baseSha);
  const paths = diff.files.flatMap((f) => (f.oldPath ? [f.path, f.oldPath] : [f.path]));
  const tier = computeTierActual(t.ticket.tier_predicted, t.project.tier_c_globs, paths);
  const moved = await moveTicket(deps.storage, t.ticket.id, ctx.nowIso, (cur) =>
    cur.status === 'verifying' && cur.tier_actual === undefined
      ? { events: [{ type: 'gate_passed', tier_actual: tier }] }
      : null,
  );

  if (!moved.ok) {
    throw new Error(`could not record gate_passed on ${t.ticket.id}: ${moved.reason}`);
  }

  return moved.ticket;
}

/** Best-effort removal of the worktree and the merged branch. */
async function cleanup(ctx: EngineCtx, t: VerifyTarget): Promise<void> {
  const { deps } = ctx;
  await deps.worktrees.remove(t.worktree).catch((e: unknown) => {
    deps.log?.('warn', `could not remove worktree of ${t.ticket.id}`, {
      error: String(e),
    });
  });

  await t.runtime.gitHost.deleteBranch(t.branch).catch((e: unknown) => {
    deps.log?.('warn', `could not delete branch ${t.branch}`, { error: String(e) });
  });
}

async function mergeTierA(
  ctx: EngineCtx,
  t: VerifyTarget,
  rows: GateRows,
): Promise<void> {
  const { deps } = ctx;
  const { ticket } = t;
  // Fail closed: the only way to be here legitimately is Verifying + tier A + a PR.
  if (
    ticket.status !== 'verifying' ||
    ticket.tier_actual !== 'A' ||
    ticket.pr_number === undefined
  ) {
    throw new PolicyDeniedError(`${ticket.id} is not eligible to merge`);
  }

  const { gitHost } = t.runtime;
  const status = await gitHost.prStatus(ticket.pr_number);
  if (status.state === 'closed') {
    throw new PolicyDeniedError(`PR ${ticket.pr_number} is closed; it cannot be merged`);
  }

  if (status.state === 'open') {
    if (status.mergeable === false) {
      throw new PolicyDeniedError(`PR ${ticket.pr_number} has merge conflicts`);
    }

    await gitHost.merge(ticket.pr_number, 'squash');
  }

  const moved = await moveTicket(deps.storage, ticket.id, ctx.nowIso, (cur) =>
    cur.status === 'verifying' ? { events: [{ type: 'merged' }] } : null,
  );

  if (!moved.ok) {
    throw new Error(`PR merged but ${ticket.id} could not move to done: ${moved.reason}`);
  }

  recordVerified(ctx, t, 'merged', rows);
  await cleanup(ctx, t);
}

/** All gates passed: set the tier, merge tier A, leave B/C for a human. */
export async function passAndMerge(
  ctx: EngineCtx,
  t: VerifyTarget,
  rows: GateRows,
): Promise<void> {
  const ticket = t.ticket.tier_actual === undefined ? await recordPass(ctx, t) : t.ticket;
  const tier: Tier | undefined = ticket.tier_actual;
  if (tier === 'B' || tier === 'C') {
    recordVerified(ctx, t, tier === 'B' ? 'review' : 'needs_signoff', rows);

    return;
  }

  await mergeTierA(ctx, { ...t, ticket }, rows);
}
