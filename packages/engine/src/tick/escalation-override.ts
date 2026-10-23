/**
 * Override: the owner's "merge anyway" and "continue" on a held ticket.
 *
 * Why: a reviewer, the critic or the Director's check can be wrong, and a plan can be honestly
 *   outgrown. The owner may overrule a hold, but only knowingly and on the record: a written
 *   reason (at least five characters), kept in the interaction's answer, on the card's history and
 *   on the held stage row itself, which then reads `passed` with the override, so the strip, the
 *   sign-off facts and the Director's own sign-off decision all see that a person overruled it (the
 *   Director then leaves the signature to the owner). The ticket resumes verifying through the
 *   state machine's `unparked`, and the pipeline goes on from the stage after the held one: sign-off,
 *   then the merge door with all its checks. A deterministic gate never gets here: it offers no
 *   override. A hold from before this existed (no stage row to mark) just resumes.
 *
 * Exports: overrideTx(), heldFindingsText().
 * Depends on: @forge/core (stage types, currentCycle), tick/{escalation-settle,stage-records,ticket-moves}.
 *   Writes inside the caller's transaction.
 */

import { currentCycle } from '@forge/core';
import type { Interaction, StageRun, StorageTx, Ticket } from '@forge/core';
import { settleEscalation } from '#/tick/escalation-settle.js';
import { finishStageRun } from '#/tick/stage-records.js';
import { moveTicketTx } from '#/tick/ticket-moves.js';
import type { EffectEnd } from '#/types/escalation.types.js';

/** The stage rows that hold the ticket for its owner: the waiting rows of the current cycle that are not the owner's own stage. */
export async function heldRows(tx: StorageTx, ticketId: string): Promise<StageRun[]> {
  const rows = await tx.stageRuns.listByTicket(ticketId);
  const cycle = currentCycle(rows) - 1;

  return rows.filter(
    (r) => r.status === 'waiting' && r.kind !== 'human' && r.cycle >= cycle,
  );
}

/** The blocking findings of held rows as the words a rework carries to the Worker, or an empty string. */
export function heldFindingsText(rows: readonly StageRun[]): string {
  return rows
    .flatMap((r) =>
      (r.outcome.review?.findings ?? [])
        .filter((f) => f.severity === 'critical' || f.severity === 'high')
        .map((f) => {
          const at =
            f.file === undefined
              ? ''
              : `${f.file}${f.line === undefined ? '' : `:${f.line}`}: `;

          return `- [${f.severity}] ${at}${f.issue} (evidence: ${f.evidence})`;
        }),
    )
    .join('\n');
}

/**
 * Settles the hold `row` with the owner's override and releases the ticket: every held stage row
 * becomes passed with the override, then the ticket resumes verifying. `stale` when the ticket is
 * no longer held from verifying, `not_pending` when someone else settled the item first.
 */
export async function overrideTx(
  tx: StorageTx,
  nowIso: string,
  row: Interaction,
  action: 'merge_anyway' | 'continue',
  comment: string,
  author: string,
): Promise<EffectEnd> {
  const ticket = await tx.tickets.get(row.ticket_id as Ticket['id']);
  if (
    !ticket ||
    ticket.status !== 'waiting_human' ||
    ticket.parked_from !== 'verifying'
  ) {
    return 'stale';
  }

  const text = comment.trim();
  const settled = await settleEscalation(
    tx,
    nowIso,
    row.card_id === undefined ? { ...row, card_id: ticket.card_id } : row,
    { action, by: 'owner', comment: text },
    author,
  );

  if (!settled) {
    return 'not_pending';
  }

  for (const held of await heldRows(tx, ticket.id)) {
    await finishStageRun(
      tx,
      held.id,
      'passed',
      { ...held.outcome, override: { by: 'owner', action, comment: text, at: nowIso } },
      nowIso,
    );
  }

  const moved = await moveTicketTx(tx, ticket.id, nowIso, (t) =>
    t.status === 'waiting_human'
      ? {
          events: [{ type: 'unparked' }],
          reason: `${action === 'merge_anyway' ? 'You chose to merge anyway' : 'You chose to continue'}: ${text}`,
        }
      : null,
  );

  if (!moved.ok) {
    throw new Error(`could not release ${ticket.id}: ${moved.reason}`);
  }

  return 'done';
}
