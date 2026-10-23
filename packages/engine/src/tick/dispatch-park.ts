/**
 * Park a ticket that cannot be dispatched until a human fixes something outside Forge.
 *
 * Why: each project names the harness its Workers run on (`default_harness`), and a server
 *   only has the drivers installed on it. If that harness is missing, starting the run on
 *   some other harness would silently change who writes the code and what policy applies
 *   (fail closed). Retrying every tick cannot fix a missing install either. So the ticket
 *   is parked with the plain reason, the user sees it in "Needs you", and releasing it
 *   after installing the harness or changing the project's setting dispatches it normally.
 *
 *   The park raises an escalation for the owner (Retry once it is fixed, Re-plan or Cancel), at
 *   the owner's stage: the Director has nothing to try on a missing install.
 *
 *   The same park serves the other case a retry cannot fix: the project's repository has no
 *   commit to cut a worktree from (an init-only folder, d-0124). The reason is the plain
 *   message the user reads in "Needs you".
 *
 *   A third case is a worktree whose setup failed on the project's own content (an install
 *   step exited non-zero, d-0180): no Worker has run and nothing was spent, so the ticket parks
 *   with a setup escalation that names the step and carries the output tail, and saving new setup
 *   steps resumes it by itself (core `isSetupFixed`).
 *
 * Exports: parkForHarness(), parkDispatch(), parkForSetup().
 * Depends on: @forge/core (SetupCause), domain/escalation-copy, tick/escalation-raise, tick/ticket-moves, tick/verify-outcomes,
 *   steps/run-step (hold), types/engine-state. IO only through storage.
 */

import type { PrepFailure, Run, SetupCause, StorageTx, Ticket } from '@forge/core';
import { fixHrefFor, setupSummary } from '#/domain/escalation-copy.js';
import { hold } from '#/steps/run-step.js';
import { attemptsOf, raiseEscalation } from '#/tick/escalation-raise.js';
import { moveTicketTx, parkPlan } from '#/tick/ticket-moves.js';
import { parkVerifyingTx } from '#/tick/verify-outcomes.js';
import type { EngineCtx } from '#/types/engine-state.types.js';

/** Parks `ticket` (planned or in progress) with the error as its reason; holds dispatch either way. */
export async function parkDispatch(
  ctx: EngineCtx,
  ticket: Ticket,
  error: unknown,
): Promise<void> {
  const reason = error instanceof Error ? error.message : String(error);
  hold(ctx, `dispatch:${ticket.id}`);

  const moved = await ctx.deps.storage.transaction(async (tx) => {
    const parked = await moveTicketTx(tx, ticket.id, ctx.nowIso, (cur) =>
      cur.status === 'planned' || cur.status === 'in_progress'
        ? { events: [{ type: 'parked', reason }] }
        : null,
    );

    // Nothing the Director can try fixes a missing harness or an empty repository: straight to the owner.
    if (parked.ok) {
      await raiseEscalation(
        tx,
        ctx.deps,
        ctx.nowIso,
        parked.ticket,
        {
          kind: 'failure',
          cause: 'not_retried',
          summary: reason,
          attempts: await attemptsOf(tx, ticket.id),
          lane: parked.ticket.lane,
        },
        'owner',
      );
    }

    return parked;
  });

  if (!moved.ok) {
    ctx.report.errors.push({ where: `dispatch ${ticket.id}`, message: reason });

    return;
  }

  ctx.report.parked.push({ ticketId: ticket.id, reason });
  ctx.deps.log?.('warn', `${ticket.id} parked: ${reason}`);
}

/** Parks `ticket` because its harness is missing (see {@link parkDispatch}). */
export const parkForHarness = parkDispatch;

/**
 * Parks `ticket` because a setup step failed: the setup escalation goes to the owner at once (no
 * Director first look, the Director cannot install a tool). `verifying` is the run being judged
 * when the failure happened before a check, so a release returns the ticket to Verifying.
 */
export async function parkForSetup(
  ctx: EngineCtx,
  ticket: Ticket,
  failure: PrepFailure,
  verifying?: Run,
): Promise<void> {
  const reason = `Forge could not get the workspace ready: ${failure.step} failed`;
  const raise = async (tx: StorageTx, parked: Ticket): Promise<void> => {
    const slug = (await tx.projects.get(ticket.project))?.slug ?? ticket.project;
    const cause: SetupCause = {
      type: 'worktree_setup',
      step: failure.step,
      command: failure.command,
      exit_code: failure.exit_code,
      timed_out: failure.timed_out,
      tail: failure.tail,
      settings_version: ctx.config.projects.get(slug)?.version.project ?? 0,
    };

    await raiseEscalation(
      tx,
      ctx.deps,
      ctx.nowIso,
      parked,
      {
        kind: 'setup',
        cause,
        summary: setupSummary(cause),
        fix_href: fixHrefFor(cause, slug, ''),
      },
      'owner',
    );
  };

  const moved = await ctx.deps.storage.transaction(async (tx) => {
    if (verifying) {
      return parkVerifyingTx(
        ctx,
        tx,
        { ticket, run: verifying },
        reason,
        [],
        undefined,
        undefined,
        raise,
      );
    }

    const parked = await moveTicketTx(tx, ticket.id, ctx.nowIso, (cur) =>
      parkPlan(cur, reason),
    );

    if (parked.ok) {
      await raise(tx, parked.ticket);
    }

    return parked.ok;
  });

  if (!moved) {
    // Not parked (it moved meanwhile): do not install again every tick.
    hold(ctx, `dispatch:${ticket.id}`);
    ctx.report.errors.push({ where: `dispatch ${ticket.id}`, message: reason });

    return;
  }

  if (!verifying) {
    ctx.report.parked.push({ ticketId: ticket.id, reason });
  }

  ctx.deps.log?.('warn', `${ticket.id} parked: ${reason}`, {
    exit_code: failure.exit_code,
  });
}
