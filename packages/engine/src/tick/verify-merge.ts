/**
 * Merge door: pin the pass to a commit, record it, decide the tier, merge only tier A.
 *
 * Why: merging is the one irreversible step, so it has exactly one entry. This file is
 *   the only caller of `GitHost.merge`, and it gets there only for a ticket the state
 *   machine holds in Verifying with `tier_actual = A`, which only a `gate_passed` event
 *   can set. A pass is evidence about one commit: gates take minutes, and a push that lands
 *   meanwhile would otherwise ride on a verdict that never saw it. So the PR head must equal
 *   the sha recorded on the gate rows, and the host is asked to merge exactly that sha; if
 *   the head moved, nothing merges and the caller gates the new head. So it does for a PR the host
 *   calls unmergeable and for a head without the base tip (tier A): a clash is not a policy denial,
 *   the ticket is gated again after main is merged in (tick/verify-sync). The tier comes from
 *   the real diff against the project's tier-C globs, not from the triage guess, and must
 *   still match what `gate_passed` recorded. Tier B and C stop in Review / NeedsSignoff for
 *   a person, and so does tier A when the pipeline has a human or sign-off stage (`hold`); each
 *   such stop leaves one sign-off item for the owner. A Director-signed sign-off lets tier A through
 *   as always, and tier B or a clean tier C (d-0181) through the owner's door below with the signer
 *   `director`; a tier C signature is re-checked here and in the state machine. The merge is
 *   resumable: if the server died after the host merged, only the ticket event is missing. Cleanup
 *   never undoes the merge. Both doors judge the checks with `decideMerge()`, so a failed gate the
 *   owner overruled merges the same either way and the card says so. The owner's approval of tier B
 *   (or sign-off of tier C) comes through `mergeReviewed()`, the same door with the same checks.
 *
 * Exports: passAndMerge(), mergeReviewed(), MergeOutcome.
 * Depends on: @forge/core (errors, DIRECTOR_SIGNER), domain/gate-rows, tick/{base-sync,merge-checks,sign-off-raise,ticket-moves,verify-merge-steps,
 *   verify-outcomes}. IO only through GitHost and worktree ports.
 */

import {
  DIRECTOR_SIGNER,
  HeadMovedError,
  MergeConflictError,
  PolicyDeniedError,
  RateLimitError,
} from '@forge/core';
import type { PrStatus } from '@forge/core';
import { gatedHeadOf } from '#/domain/gate-rows.js';
import { baseTipFor } from '#/tick/base-sync.js';
import { judgeMerge, noteOverriddenMerge } from '#/tick/merge-checks.js';
import { waitForOwner } from '#/tick/sign-off-raise.js';
import { moveTicket } from '#/tick/ticket-moves.js';
import {
  assertAutoMergeable,
  assertCleanTierC,
  assertReviewable,
  cleanup,
  recordPass,
  regateReviewed,
  settleReviewed,
  tierCNote,
  tierOfDiff,
} from '#/tick/verify-merge-steps.js';
import { recordVerified } from '#/tick/verify-outcomes.js';
import type { EngineCtx } from '#/types/engine-state.types.js';
import type {
  GateRows,
  MergeOpts,
  MergeOutcome,
  ReviewedExtras,
  VerifyTarget,
} from '#/types/verify.types.js';

async function mergeTierA(
  ctx: EngineCtx,
  t: VerifyTarget,
  rows: GateRows,
  status: PrStatus,
  gatedSha: string,
  overrideNote = '',
): Promise<MergeOutcome> {
  const { deps } = ctx;
  const { ticket } = t;
  const prNumber = assertAutoMergeable(ticket, status);
  if (status.state === 'open') {
    // A clash is not a policy decision: judge again after main is merged in (tick/verify-sync).
    if (status.mergeable === false) {
      return 'regate';
    }

    if (status.mergeable === null) {
      // The host has not computed it yet. Never merge blind: back off like a rate limit,
      // which the retry cap turns into a park if the host never answers.
      throw new RateLimitError(
        `PR ${prNumber} mergeability is not computed yet; trying again later`,
      );
    }

    // The pass judged this head; if main moved on since, those gates never saw the merged result.
    const tip = await baseTipFor(ctx, t.project.slug, t.runtime.gitHost);
    if (!(await t.runtime.worktrees.contains(t.worktree, tip.sha))) {
      return 'regate';
    }

    try {
      await t.runtime.gitHost.merge(prNumber, 'squash', gatedSha);
    } catch (e) {
      if (e instanceof HeadMovedError || e instanceof MergeConflictError) {
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

  await noteOverriddenMerge(ctx, ticket, overrideNote);
  recordVerified(ctx, t, 'merged', rows);
  await cleanup(ctx, t);

  return 'done';
}

/**
 * The owner's approval of tier B work (or sign-off of tier C): merges exactly the sha the gates
 * judged, then moves the ticket to done through `transition()`. `head_moved` when the PR head is
 * not that sha: nothing merged, and the ticket goes back to verifying (`regate`). Same checks as
 * the automatic merge (tier still matches the diff, PR open and mergeable); resumable like it.
 */
export async function mergeReviewed(
  ctx: EngineCtx,
  t: VerifyTarget,
  rows: GateRows,
  signer?: string,
  also: ReviewedExtras = {},
): Promise<'done' | 'head_moved'> {
  const { ticket } = t;
  const byDirector = signer?.trim().toLowerCase() === DIRECTOR_SIGNER;
  const prNumber = assertReviewable(ticket, byDirector, also.cleanFloor === true);

  const status = await t.runtime.gitHost.prStatus(prNumber);
  if (status.state === 'closed') {
    throw new PolicyDeniedError(`PR ${prNumber} is closed; it cannot be merged`);
  }

  let mergeSha: string | undefined;
  if (status.state === 'open') {
    const gatedSha = gatedHeadOf(rows);
    let moved = gatedSha === undefined || status.headSha !== gatedSha;
    if (!moved) {
      const tier = await tierOfDiff(ctx, t);
      if (tier !== ticket.tier_actual) {
        throw new PolicyDeniedError(
          `${ticket.id} was recorded as tier ${ticket.tier_actual} but its diff is tier ${tier}`,
        );
      }

      if (status.mergeable === null) {
        throw new RateLimitError(
          `PR ${prNumber} mergeability is not computed yet; try again in a moment`,
        );
      }

      // A clash the owner never saw (main moved after the gates) goes back to be merged in and gated, not refused.
      if (status.mergeable === false) {
        moved = true;
      } else {
        try {
          mergeSha = (await t.runtime.gitHost.merge(prNumber, 'squash', gatedSha ?? ''))
            .sha;
        } catch (e) {
          if (!(e instanceof HeadMovedError || e instanceof MergeConflictError)) {
            throw e;
          }

          moved = true;
        }
      }
    }

    if (moved) {
      return regateReviewed(ctx, ticket);
    }
  }

  const who = signer?.trim() ? signer.trim() : undefined;
  const done = await settleReviewed(ctx, ticket, who, byDirector, also, mergeSha);

  if (!done.ok) {
    throw new Error(`PR merged but ${ticket.id} could not move to done: ${done.reason}`);
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
  mode: boolean | MergeOpts = false,
): Promise<MergeOutcome> {
  const opts: MergeOpts = typeof mode === 'boolean' ? { hold: mode } : mode;
  const gatedSha = gatedHeadOf(rows);
  const prNumber = t.ticket.pr_number;
  if (prNumber === undefined) {
    // Verdicts without a PR cannot have come from a published head: publish and gate it.
    return 'regate';
  }

  const status = await t.runtime.gitHost.prStatus(prNumber);
  const judged = await judgeMerge(ctx, t, rows, status);
  if (judged === 'regate') {
    return 'regate';
  }

  const tier = await tierOfDiff(ctx, t);
  const ticket =
    t.ticket.tier_actual === undefined
      ? await recordPass(ctx, t, tier, opts.hold)
      : t.ticket;

  // A re-gated head may touch other files than the ones `gate_passed` was recorded for.
  if (ticket.tier_actual !== tier) {
    throw new PolicyDeniedError(
      `${ticket.id} was recorded as tier ${ticket.tier_actual ?? '?'} but its diff is tier ${tier}`,
    );
  }

  // Fail closed: a Director signature carries tier C only when its row says it signed tier C (a clean
  // floor) and the diff still holds no secrets path; whatever else the stage rows say, a person signs.
  if (opts.directorSigned === true && tier === 'C') {
    await assertCleanTierC(t, ticket, opts.signedTier);
    const end = await mergeReviewed(ctx, { ...t, ticket }, rows, DIRECTOR_SIGNER, {
      note: tierCNote(ticket.id, opts.signReason),
      overrideNote: judged.overrideNote,
      cleanFloor: true,
    });

    return end === 'done' ? 'done' : 'regate';
  }

  if (opts.directorSigned === true && tier === 'B') {
    const end = await mergeReviewed(ctx, { ...t, ticket }, rows, DIRECTOR_SIGNER, {
      note: `Signed off by the Director (tier B): ${opts.signReason ?? 'every check passed'}`,
      overrideNote: judged.overrideNote,
    });

    return end === 'done' ? 'done' : 'regate';
  }

  if (tier === 'B' || tier === 'C' || opts.hold) {
    await waitForOwner(ctx, ticket, tier, opts, t.run.id);
    recordVerified(ctx, t, tier === 'C' ? 'needs_signoff' : 'review', rows);

    return 'done';
  }

  // A merged PR has no head left to pin; `gatedSha` only matters while the PR is open.
  return mergeTierA(
    ctx,
    { ...t, ticket },
    rows,
    status,
    gatedSha ?? '',
    judged.overrideNote,
  );
}
