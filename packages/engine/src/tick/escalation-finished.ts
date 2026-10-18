/**
 * Raising the waits of finished work: a held ticket's decision and the owner's sign-off.
 *
 * Why: when a stage stops finished work in a way the owner may overrule (a reviewer's findings
 *   after the automatic reworks, the critic, the Director's check, work that outgrew its plan) the
 *   ticket must not dead-end in a generic failure: it parks from Verifying with a reason that says
 *   which kind of hold it is, and one `decision` interaction at the owner stage carries the
 *   findings, the files outside the plan and the rework count, so the card chat, the ticket page
 *   and the Inbox all offer Merge anyway, Send back, Re-plan or Cancel from the same item (d-0135).
 *   Finished work that waits for the owner's name (tier B, tier C, a human stage, or a sign-off the
 *   Director declined) leaves one `sign_off` interaction behind it, so the review wait is an item
 *   too and not a bare ticket status. Neither starts with the Director's first look: the Director
 *   has just had it, or a person must decide. Both write inside the caller's transaction, so a
 *   ticket never waits without its item.
 *
 * Exports: raiseDecisionTx(), raiseSignOffTx(), holdReason().
 * Depends on: @forge/core (escalation schemas), tick/{escalation-raise,verify-outcomes}. Writes inside the caller's transaction.
 */

import type {
  DecisionCause,
  EscalationDecision,
  EscalationSignOff,
  StorageTx,
  Ticket,
} from '@forge/core';
import { raiseEscalation } from '#/tick/escalation-raise.js';
import { parkVerifyingTx } from '#/tick/verify-outcomes.js';
import type { EngineCtx } from '#/types/engine-state.types.js';
import type { GateRows, VerifyTarget } from '#/types/verify.types.js';

/** The park reason of a hold: `<cause>: <summary>`, the form `classifyPark` reads back at start-up. */
export const holdReason = (cause: DecisionCause, summary: string): string =>
  `${cause}: ${summary}`;

/**
 * Parks the Verifying ticket `t` for the owner's decision and raises the `decision` item at the
 * owner stage. False when the ticket was not verifying (nothing is written).
 */
export async function raiseDecisionTx(
  ctx: EngineCtx,
  tx: StorageTx,
  t: Pick<VerifyTarget, 'ticket' | 'run'>,
  payload: EscalationDecision,
  rows: GateRows = [],
  also?: (tx: StorageTx) => Promise<void>,
): Promise<boolean> {
  return parkVerifyingTx(
    ctx,
    tx,
    t,
    holdReason(payload.cause, payload.summary),
    rows,
    undefined,
    also,
    async (inner, ticket) => {
      await raiseEscalation(
        inner,
        ctx.deps,
        ctx.nowIso,
        ticket,
        payload,
        'owner',
        t.run.id,
      );
    },
  );
}

/** Raises the `sign_off` item for finished work that waits for the owner; the ticket is already in review or needs sign-off. */
export async function raiseSignOffTx(
  ctx: EngineCtx,
  tx: StorageTx,
  ticket: Ticket,
  payload: EscalationSignOff,
  runId?: string,
): Promise<string | null> {
  return raiseEscalation(tx, ctx.deps, ctx.nowIso, ticket, payload, 'owner', runId);
}
