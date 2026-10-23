/**
 * Merge steps: the tier a diff implies, recording a pass, and the cleanup after Done.
 *
 * Why: the merge door (tick/verify-merge) is the only caller of the git host, and it must stay
 *   readable as one sequence of checks. The three small steps around it live here: the tier comes
 *   from the real diff against the project's tier-C globs (never from the triage guess), a pass is
 *   recorded once per cycle through `transition()` (carrying `hold` when the pipeline has a human
 *   stage, so a tier A ticket waits in Review too), sending an approval that met a moved head or a
 *   clash back to the gates, and cleanup after Done is best effort and never undoes the merge.
 *
 * Exports: diffPaths(), secretPathOfDiff(), assertCleanTierC(), tierCNote(), settleReviewed(), tierOfDiff(), assertAutoMergeable(), assertReviewable(), recordPass(), regateReviewed(), cleanup().
 * Depends on: @forge/core (Ticket, Tier), domain/tier-actual, tick/{card-log,ticket-moves}, tick/tick-config. IO only through worktree and host ports.
 */

import { findSecretPath, PolicyDeniedError } from '@forge/core';
import type { PrStatus, Ticket, Tier } from '@forge/core';
import { computeTierActual } from '#/domain/tier-actual.js';
import { ENGINE_ACTOR, logCardEvent } from '#/tick/card-log.js';
import { moveTicket, moveTicketTx } from '#/tick/ticket-moves.js';
import { projectSettings } from '#/tick/tick-config.js';
import type { EngineCtx } from '#/types/engine-state.types.js';
import type { ReviewedExtras, VerifyTarget } from '#/types/verify.types.js';

/** Every path the current diff touches (a rename counts both names). */
export async function diffPaths(t: VerifyTarget): Promise<string[]> {
  const diff = await t.runtime.worktrees.diff(t.worktree, t.baseSha);

  return diff.files.flatMap((f) => (f.oldPath ? [f.path, f.oldPath] : [f.path]));
}

/** The first changed path that is a secrets path, or null (d-0181). */
export async function secretPathOfDiff(t: VerifyTarget): Promise<string | null> {
  return findSecretPath(await diffPaths(t));
}

/** The tier the current diff implies. */
export async function tierOfDiff(ctx: EngineCtx, t: VerifyTarget): Promise<Tier> {
  return computeTierActual(
    t.ticket.tier_predicted,
    projectSettings(ctx.config, t.project.slug).tier_c_globs,
    await diffPaths(t),
  );
}

/**
 * Fail closed (d-0181): a Director signature carries tier C only when its sign-off row says it signed
 * tier C and the diff still holds no secrets path, whatever else the stage rows say.
 */
export async function assertCleanTierC(
  t: VerifyTarget,
  ticket: Ticket,
  signedTier: Tier | undefined,
): Promise<void> {
  if (signedTier !== 'C' || (await secretPathOfDiff(t)) !== null) {
    throw new PolicyDeniedError(`${ticket.id} is tier C; only a person signs it`);
  }
}

/** The card note of a Director-signed tier C merge. */
export function tierCNote(id: string, why: string | undefined): string {
  return `The Director signed off tier C change ${id} (all checks passed, 0 critical/high, plan check passed): ${why ?? 'clean floor'}`;
}

/**
 * How the owner undoes a Director-signed tier C merge. The git host has no revert path yet, so the
 * note names the merge commit to revert; the one-click revert action is a later step (d-0181).
 */
function undoLine(sha: string | undefined): string {
  return sha === undefined
    ? 'Undo: revert the merge commit of this change.'
    : `Undo: revert merge commit ${sha.slice(0, 12)}.`;
}

/**
 * Moves a reviewed ticket to done through `transition()` and writes the card note, in one transaction
 * with the caller's own writes. A Director-signed tier C carries `clean_floor` and the undo line.
 */
export async function settleReviewed(
  ctx: EngineCtx,
  ticket: Ticket,
  who: string | undefined,
  byDirector: boolean,
  also: ReviewedExtras,
  mergeSha: string | undefined,
) {
  return ctx.deps.storage.transaction(async (tx) => {
    // The caller's own writes (settling the sign-off item) join the transaction that moves the ticket.
    await also.beforeMove?.(tx);
    const end = await moveTicketTx(tx, ticket.id, ctx.nowIso, (cur) =>
      cur.status === ticket.status
        ? {
            events: [
              {
                type: 'done',
                ...(who === undefined ? {} : { signer: who }),
                ...(also.cleanFloor === true ? { clean_floor: true as const } : {}),
              },
            ],
          }
        : null,
    );

    if (end.ok) {
      await logCardEvent(tx, ticket.card_id, {
        kind: 'note',
        at: ctx.nowIso,
        actor: byDirector ? ENGINE_ACTOR : { type: 'user', id: who ?? 'owner' },
        payload: {
          text: [
            also.note ??
              (who === undefined
                ? `${ticket.id} was approved and merged.`
                : `${ticket.id} was signed off by ${who} and merged.`),
            also.cleanFloor === true ? undoLine(mergeSha) : '',
            also.overrideNote,
          ]
            .filter((x) => x)
            .join(' '),
        },
      });
    }

    return end;
  });
}

/**
 * Fail closed: the only way to merge on its own is Verifying + tier A + an open or merged PR.
 * Returns the PR number.
 */
export function assertAutoMergeable(ticket: Ticket, status: PrStatus): number {
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

  return ticket.pr_number;
}

/** Records `gate_passed` with `tier` (once per cycle); `hold` sends a tier A pass to the owner's review. */
export async function recordPass(
  ctx: EngineCtx,
  t: VerifyTarget,
  tier: Tier,
  hold: boolean,
): Promise<Ticket> {
  const moved = await moveTicket(ctx.deps.storage, t.ticket.id, ctx.nowIso, (cur) =>
    cur.status === 'verifying' && cur.tier_actual === undefined
      ? {
          events: [
            {
              type: 'gate_passed',
              tier_actual: tier,
              ...(hold ? { hold: true as const } : {}),
            },
          ],
        }
      : null,
  );

  if (!moved.ok) {
    throw new Error(`could not record gate_passed on ${t.ticket.id}: ${moved.reason}`);
  }

  return moved.ticket;
}

/**
 * The owner's approval met a head that moved or a PR that no longer merges: the ticket goes back to
 * Verifying (`regate`) so main is merged in and the work is gated again. Returns `head_moved`.
 */
export async function regateReviewed(
  ctx: EngineCtx,
  ticket: Ticket,
): Promise<'head_moved'> {
  const back = await moveTicket(ctx.deps.storage, ticket.id, ctx.nowIso, (cur) =>
    cur.status === ticket.status ? { events: [{ type: 'regate' }] } : null,
  );

  if (!back.ok) {
    throw new Error(`could not send ${ticket.id} back to the gates: ${back.reason}`);
  }

  return 'head_moved';
}

/** Best-effort removal of the worktree and the merged branch. */
export async function cleanup(ctx: EngineCtx, t: VerifyTarget): Promise<void> {
  const { deps } = ctx;
  await t.runtime.worktrees.remove(t.worktree).catch((e: unknown) => {
    deps.log?.('warn', `could not remove worktree of ${t.ticket.id}`, {
      error: String(e),
    });
  });

  await t.runtime.gitHost.deleteBranch(t.branch).catch((e: unknown) => {
    deps.log?.('warn', `could not delete branch ${t.branch}`, { error: String(e) });
  });
}

/**
 * Fail closed: only finished work in review (B, or A held by a human stage) or sign-off (C), with a
 * PR, merges through an approval; the Director signs tier A and B, and tier C only on a clean floor
 * (d-0181). Returns the PR number.
 */
export function assertReviewable(
  ticket: Ticket,
  byDirector: boolean,
  cleanFloor = false,
): number {
  if (byDirector && ticket.tier_actual === 'C' && !cleanFloor) {
    throw new PolicyDeniedError(
      `${ticket.id} is tier C; only a named person signs it off unless the floor is clean`,
    );
  }

  const tierOk =
    ticket.status === 'review'
      ? ticket.tier_actual === 'A' || ticket.tier_actual === 'B'
      : ticket.tier_actual === 'C';

  if (
    (ticket.status !== 'review' && ticket.status !== 'needs_signoff') ||
    !tierOk ||
    ticket.pr_number === undefined
  ) {
    throw new PolicyDeniedError(`${ticket.id} is not eligible to merge`);
  }

  return ticket.pr_number;
}
