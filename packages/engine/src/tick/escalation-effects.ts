/**
 * What an action on an escalation does to its ticket and card.
 *
 * Why: the owner's click, the Director's one allowed retry and the automatic resume after a
 *   setup is fixed all end a wait the same way, and they must do it through the same doors
 *   (code.md rule 6): the interaction is settled first by compare-and-swap, the ticket moves
 *   only through `transition()`, the card only through `transitionCard()`, and the work that
 *   follows (a new run with the owner's note, a re-plan turn) is queued in the same transaction,
 *   so a crash leaves either the whole action or none of it. Retry from a rework cap gives the
 *   ticket exactly one more attempt because `rework_count` stays at the cap: if it fails its
 *   gates again it parks again instead of looping. A re-plan parks nothing new: the ticket stays
 *   parked, the card goes back to the Director with the owner's comment, and the earlier plan's
 *   not-started tickets are replaced only when the new plan is approved (d-0134).
 *
 * Exports: retryReason(), retryTx(), replanTx(), reworkTx().
 * Depends on: @forge/core (escalation schemas, card rules), tick/card-log, tick/card-phase,
 *   tick/escalation-settle, tick/plan-actions, tick/planning-state, tick/ticket-moves, tick/wakes.
 *   Writes inside the caller's transaction.
 */

import { GrillState } from '@forge/core';
import type { EscalationAnswer, Interaction, StorageTx, Ticket } from '@forge/core';
import { logCardEvent } from '#/tick/card-log.js';
import { moveCardTx } from '#/tick/card-phase.js';
import { settleEscalation } from '#/tick/escalation-settle.js';
import { grillIndex } from '#/tick/plan-actions.js';
import { setNeedsYou } from '#/tick/planning-state.js';
import { moveTicketTx } from '#/tick/ticket-moves.js';
import { requestWakeTx } from '#/tick/wakes.js';
import type { EngineDeps } from '#/types/engine.types.js';
import type { EffectEnd } from '#/types/escalation.types.js';

/** The wake reason that carries a retry's note to the next run's prompt: `<who>_retry: <note>`. */
export const retryReason = (by: 'owner' | 'director' | 'auto', note?: string): string =>
  `${by}_retry${note ? `: ${note}` : ''}`;

/**
 * Releases a waiting ticket for another attempt: settles `row` with `answer`, moves the ticket
 * (`unblocked` from Blocked, `unparked` from WaitingHuman) and, when it goes back to Planned,
 * queues a retry wake that carries the note. A ticket parked from Verifying resumes verifying
 * with no new Worker run.
 */
export async function retryTx(
  deps: EngineDeps,
  tx: StorageTx,
  nowIso: string,
  row: Interaction,
  answer: EscalationAnswer,
  author: string,
): Promise<EffectEnd> {
  const ticket = await tx.tickets.get(row.ticket_id as Ticket['id']);
  if (!ticket || (ticket.status !== 'waiting_human' && ticket.status !== 'blocked')) {
    return 'stale';
  }

  const card = row.card_id ?? ticket.card_id;
  if (!(await settleEscalation(tx, nowIso, withCard(row, card), answer, author))) {
    return 'not_pending';
  }

  const moved = await moveTicketTx(tx, ticket.id, nowIso, (t) => ({
    events: [{ type: t.status === 'blocked' ? 'unblocked' : 'unparked' }],
  }));

  if (!moved.ok) {
    throw new Error(`could not release ${ticket.id}: ${moved.reason}`);
  }

  if (moved.ticket.status === 'planned') {
    // A ticket whose last run reported done (the rework cap) is sent back like a rework: a plain
    // retry wake would be dropped as "its run already reported done".
    const last = ticket.assignee_run_id
      ? await tx.runs.get(ticket.assignee_run_id)
      : null;

    await requestWakeTx(tx, deps, {
      ticketId: ticket.id,
      kind: last?.status === 'success' ? 'continuation' : 'retry',
      reason: retryReason(answer.by, answer.note),
      key: row.id,
      uncapped: true,
    });
  }

  return 'done';
}

const withCard = (row: Interaction, card: Interaction['card_id']) =>
  card === undefined ? row : { ...row, card_id: card };

/**
 * Sends the card back to the Director with the owner's comment: settles `row`, writes
 * `replan_requested`, moves the card to grilling through `transitionCard()` and queues the
 * Director's next planning turn. With an earlier plan the Director re-grills on the comment and
 * writes the next version; a card that never had one is planned from the start with the comment
 * as an owner note. The parked ticket is left as it is.
 */
export async function replanTx(
  tx: StorageTx,
  nowIso: string,
  row: Interaction,
  comment: string,
  author: string,
): Promise<EffectEnd> {
  const ticket = await tx.tickets.get(row.ticket_id as Ticket['id']);
  const card = ticket?.card_id === undefined ? null : await tx.cards.get(ticket.card_id);
  if (!ticket || !card || card.closed_reason !== undefined) {
    return 'stale';
  }

  // A done card may be re-planned: the owner asks for more work and the Director re-grills.
  if (card.phase === 'closed') {
    return 'stale';
  }

  if (
    !(await settleEscalation(
      tx,
      nowIso,
      withCard(row, card.id),
      { action: 'replan', by: 'owner', comment },
      author,
    ))
  ) {
    return 'not_pending';
  }

  const event = await logCardEvent(tx, card.id, {
    kind: 'replan_requested',
    at: nowIso,
    actor: { type: 'user', id: author },
    payload: { ticket_id: ticket.id, comment, by: 'owner' },
  });

  if (card.phase !== 'grilling') {
    const moved = await moveCardTx(tx, card.id, { type: 'regrill' }, nowIso);
    if (!moved.ok) {
      throw new Error(`could not re-plan ${card.id}: ${moved.reason}`);
    }
  }

  await setNeedsYou(tx, card.id, false, nowIso);
  const planning = await tx.cardPlanning.get(card.id);
  const latest = await tx.cardPlanning.latestPlan(card.id);
  const fresh = GrillState.parse({
    ...planning.grill,
    done: false,
    done_reason: null,
    current: null,
    queued: [],
    round_asked: 0,
    round_open: false,
    open_points: null,
    floor: null,
    ...(latest
      ? { pending_changes: { version: latest.version, comment } }
      : {
          answers: [
            ...planning.grill.answers,
            { question_id: 'note', question: 'Owner note', answer: comment, by: 'owner' },
          ],
        }),
  });

  await tx.cardPlanning.update(card.id, {
    grill: fresh,
    ...(latest ? { flow_cursor: grillIndex(planning.flow) } : {}),
  });

  await tx.cardReplyQueue.enqueue({
    card_id: card.id,
    event_id: event?.seq ?? 0,
    reason: latest ? 'plan_changes' : 'start_planning',
    enqueued_at: nowIso,
  });

  return 'done';
}

/**
 * Sends finished work back to its Worker: the `rework` event moves a ticket in review or
 * waiting for sign-off to In Progress, and a continuation wake carries the owner's comment to the
 * next run's prompt. False when the ticket is not in a state that can be reworked.
 */
export async function reworkTx(
  deps: EngineDeps,
  tx: StorageTx,
  nowIso: string,
  ticketId: string,
  comment: string,
): Promise<boolean> {
  const moved = await moveTicketTx(tx, ticketId, nowIso, (t) =>
    t.status === 'review' || t.status === 'needs_signoff'
      ? { events: [{ type: 'rework' }] }
      : null,
  );

  if (!moved.ok) {
    return false;
  }

  await requestWakeTx(tx, deps, {
    ticketId,
    kind: 'continuation',
    reason: `owner_rework: ${comment}`,
    key: `rework-${moved.ticket.status_version}`,
  });

  return true;
}
