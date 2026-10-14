/**
 * Merge door: pin the pass to a commit, record it, decide the tier, merge only tier A.
 *
 * Why: merging is the one irreversible step, so it has exactly one entry. This file is
 *   the only caller of `GitHost.merge`, and it gets there only for a ticket the state
 *   machine holds in Verifying with `tier_actual = A`, which only a `gate_passed` event
 *   can set. A pass is evidence about one commit: gates take minutes, and a push that lands
 *   meanwhile would otherwise ride on a verdict that never saw it. So the PR head must equal
 *   the sha recorded on the gate rows, and the host is asked to merge exactly that sha; if
 *   the head moved, nothing merges and the caller gates the new head. The tier comes from
 *   the real diff against the project's tier-C globs, not from the triage guess, and must
 *   still match what `gate_passed` recorded. Tier B and C stop in Review / NeedsSignoff for
 *   a human. The merge is resumable: if the server died after the host merged but before the
 *   ticket moved, the PR already reads as merged and only the ticket event is missing.
 *   Cleanup after Done is best effort and never undoes the merge.
 *
 * Exports: passAndMerge(), MergeOutcome.
 * Depends on: @forge/core (errors), domain/{gate-rows,tier-actual}, tick/ticket-moves,
 *   tick/verify-outcomes. IO only through GitHost and worktree ports.
 */

import { HeadMovedError, PolicyDeniedError, RateLimitError } from '@forge/core';
import type { PrStatus, Ticket, Tier } from '@forge/core';
import { gatedHeadOf } from '#/domain/gate-rows.js';
import { computeTierActual } from '#/domain/tier-actual.js';
import { moveTicket } from '#/tick/ticket-moves.js';
import { projectSettings } from '#/tick/tick-config.js';
import { recordVerified } from '#/tick/verify-outcomes.js';
import type { EngineCtx } from '#/types/engine-state.types.js';
import type { GateRows, MergeOutcome, VerifyTarget } from '#/types/verify.types.js';

/** The tier the current diff implies. */
async function tierOfDiff(ctx: EngineCtx, t: VerifyTarget): Promise<Tier> {
  const diff = await ctx.deps.worktrees.diff(t.worktree, t.baseSha);
  const paths = diff.files.flatMap((f) => (f.oldPath ? [f.path, f.oldPath] : [f.path]));

  return computeTierActual(
    t.ticket.tier_predicted,
    projectSettings(ctx.config, t.project.slug).tier_c_globs,
    paths,
  );
}

/** Records `gate_passed` with `tier` (once per cycle). */
async function recordPass(ctx: EngineCtx, t: VerifyTarget, tier: Tier): Promise<Ticket> {
  const moved = await moveTicket(ctx.deps.storage, t.ticket.id, ctx.nowIso, (cur) =>
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
  status: PrStatus,
  gatedSha: string,
): Promise<MergeOutcome> {
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

  if (status.state === 'closed') {
    throw new PolicyDeniedError(`PR ${ticket.pr_number} is closed; it cannot be merged`);
  }

  if (status.state === 'open') {
    if (status.mergeable === false) {
      throw new PolicyDeniedError(`PR ${ticket.pr_number} has merge conflicts`);
    }

    if (status.mergeable === null) {
      // The host has not computed it yet. Never merge blind: back off like a rate limit,
      // which the retry cap turns into a park if the host never answers.
      throw new RateLimitError(
        `PR ${ticket.pr_number} mergeability is not computed yet; trying again later`,
      );
    }

    try {
      await t.runtime.gitHost.merge(ticket.pr_number, 'squash', gatedSha);
    } catch (e) {
      if (e instanceof HeadMovedError) {
        return 'regate';
      }

      throw e;
    }
  }

  const moved = await moveTicket(deps.storage, ticket.id, ctx.nowIso, (cur) =>
    cur.status === 'verifying' ? { events: [{ type: 'merged' }] } : null,
  );

  if (!moved.ok) {
    throw new Error(`PR merged but ${ticket.id} could not move to done: ${moved.reason}`);
  }

  recordVerified(ctx, t, 'merged', rows);
  await cleanup(ctx, t);

  return 'done';
}

/** All gates passed: check the head, set the tier, merge tier A, leave B/C for a human. */
export async function passAndMerge(
  ctx: EngineCtx,
  t: VerifyTarget,
  rows: GateRows,
): Promise<MergeOutcome> {
  const gatedSha = gatedHeadOf(rows);
  const prNumber = t.ticket.pr_number;
  if (prNumber === undefined) {
    // Verdicts without a PR cannot have come from a published head: publish and gate it.
    return 'regate';
  }

  const status = await t.runtime.gitHost.prStatus(prNumber);
  if (
    status.state === 'open' &&
    (gatedSha === undefined || status.headSha !== gatedSha)
  ) {
    return 'regate';
  }

  const tier = await tierOfDiff(ctx, t);
  const ticket =
    t.ticket.tier_actual === undefined ? await recordPass(ctx, t, tier) : t.ticket;

  // A re-gated head may touch other files than the ones `gate_passed` was recorded for.
  if (ticket.tier_actual !== tier) {
    throw new PolicyDeniedError(
      `${ticket.id} was recorded as tier ${ticket.tier_actual ?? '?'} but its diff is tier ${tier}`,
    );
  }

  if (tier === 'B' || tier === 'C') {
    recordVerified(ctx, t, tier === 'B' ? 'review' : 'needs_signoff', rows);

    return 'done';
  }

  // A merged PR has no head left to pin; `gatedSha` only matters while the PR is open.
  return mergeTierA(ctx, { ...t, ticket }, rows, status, gatedSha ?? '');
}
