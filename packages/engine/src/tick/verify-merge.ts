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
 *   a human, and so does tier A when the pipeline has a human stage (`hold`). The merge is resumable: if the server died after the host merged but before the
 *   ticket moved, the PR already reads as merged and only the ticket event is missing.
 *   Cleanup after Done is best effort and never undoes the merge. The owner's approval of tier B
 *   (or sign-off of tier C) comes through `mergeReviewed()`, the same door with the same checks.
 *
 * Exports: passAndMerge(), mergeReviewed(), MergeOutcome.
 * Depends on: @forge/core (errors), domain/gate-rows, tick/{stage-records,ticket-moves,verify-merge-steps,
 *   verify-outcomes}. IO only through GitHost and worktree ports.
 */

import { HeadMovedError, PolicyDeniedError, RateLimitError } from '@forge/core';
import type { PrStatus } from '@forge/core';
import { gatedHeadOf } from '#/domain/gate-rows.js';
import { logCardEvent } from '#/tick/card-log.js';
import { holdForHuman } from '#/tick/stage-records.js';
import { moveTicket, moveTicketTx } from '#/tick/ticket-moves.js';
import { cleanup, recordPass, tierOfDiff } from '#/tick/verify-merge-steps.js';
import { recordVerified } from '#/tick/verify-outcomes.js';
import type { EngineCtx } from '#/types/engine-state.types.js';
import type { GateRows, MergeOutcome, VerifyTarget } from '#/types/verify.types.js';

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

/**
 * The owner's approval of tier B work (or sign-off of tier C): merges exactly the sha the gates
 * judged, then moves the ticket to done through `transition()` (`done`, with the signer for C).
 * `head_moved` when the PR head is not that sha: nothing merged, and the ticket goes back to
 * verifying (`regate`) so the new head is gated again. Same checks as the automatic merge: the
 * tier must still match the diff, the PR must be open and mergeable. Resumable like it: a PR
 * the host already merged only needs the ticket event.
 */
export async function mergeReviewed(
  ctx: EngineCtx,
  t: VerifyTarget,
  rows: GateRows,
  signer?: string,
): Promise<'done' | 'head_moved'> {
  const { ticket } = t;
  const prNumber = ticket.pr_number;
  // Fail closed: only finished work in review (B, or A held by a human stage) or sign-off (C), with a PR, merges here.
  const tierOk =
    ticket.status === 'review'
      ? ticket.tier_actual === 'A' || ticket.tier_actual === 'B'
      : ticket.tier_actual === 'C';

  if (
    (ticket.status !== 'review' && ticket.status !== 'needs_signoff') ||
    !tierOk ||
    prNumber === undefined
  ) {
    throw new PolicyDeniedError(`${ticket.id} is not eligible to merge`);
  }

  const status = await t.runtime.gitHost.prStatus(prNumber);
  if (status.state === 'closed') {
    throw new PolicyDeniedError(`PR ${prNumber} is closed; it cannot be merged`);
  }

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

      if (status.mergeable === false) {
        throw new PolicyDeniedError(`PR ${prNumber} has merge conflicts`);
      }

      if (status.mergeable === null) {
        throw new RateLimitError(
          `PR ${prNumber} mergeability is not computed yet; try again in a moment`,
        );
      }

      try {
        await t.runtime.gitHost.merge(prNumber, 'squash', gatedSha ?? '');
      } catch (e) {
        if (!(e instanceof HeadMovedError)) {
          throw e;
        }

        moved = true;
      }
    }

    if (moved) {
      const back = await moveTicket(ctx.deps.storage, ticket.id, ctx.nowIso, (cur) =>
        cur.status === ticket.status ? { events: [{ type: 'regate' }] } : null,
      );

      if (!back.ok) {
        throw new Error(`could not send ${ticket.id} back to the gates: ${back.reason}`);
      }

      return 'head_moved';
    }
  }

  const who = signer?.trim() ? signer.trim() : undefined;
  const done = await ctx.deps.storage.transaction(async (tx) => {
    const end = await moveTicketTx(tx, ticket.id, ctx.nowIso, (cur) =>
      cur.status === ticket.status
        ? { events: [{ type: 'done', ...(who === undefined ? {} : { signer: who }) }] }
        : null,
    );

    if (end.ok) {
      await logCardEvent(tx, ticket.card_id, {
        kind: 'note',
        at: ctx.nowIso,
        actor: { type: 'user', id: who ?? 'owner' },
        payload: {
          text:
            who === undefined
              ? `${ticket.id} was approved and merged.`
              : `${ticket.id} was signed off by ${who} and merged.`,
        },
      });
    }

    return end;
  });

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
  hold = false,
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
    t.ticket.tier_actual === undefined ? await recordPass(ctx, t, tier, hold) : t.ticket;

  // A re-gated head may touch other files than the ones `gate_passed` was recorded for.
  if (ticket.tier_actual !== tier) {
    throw new PolicyDeniedError(
      `${ticket.id} was recorded as tier ${ticket.tier_actual ?? '?'} but its diff is tier ${tier}`,
    );
  }

  if (tier === 'B' || tier === 'C' || hold) {
    // The pipeline's human stage begins: the owner's review is a row, so the ticket page shows it.
    if (hold) {
      await ctx.deps.storage.transaction((tx) => holdForHuman(tx, ctx.nowIso, ticket.id));
    }

    recordVerified(ctx, t, tier === 'C' ? 'needs_signoff' : 'review', rows);

    return 'done';
  }

  // A merged PR has no head left to pin; `gatedSha` only matters while the PR is open.
  return mergeTierA(ctx, { ...t, ticket }, rows, status, gatedSha ?? '');
}
