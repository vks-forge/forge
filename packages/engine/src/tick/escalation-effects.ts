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
 *   gates again it parks again instead of looping; Retry on a merge conflict is the same: the
 *   writer is woken with the clash again and the owner's note. A re-plan parks nothing new: the ticket stays
 *   parked, the card goes back to the Director with the owner's comment, and the earlier plan's
 *   not-started tickets are replaced only when the new plan is approved (d-0134).
 *
 * Exports: retryReason(), retryTx(), replanTx(), reworkTx(), replannable().
 * Depends on: @forge/core (escalation schemas, card rules), domain/conflict-wake, tick/agent-fallback, tick/card-log, tick/card-phase,
 *   tick/escalation-settle, tick/plan-actions, tick/planning-state, tick/ticket-moves, tick/wakes.
 *   Writes inside the caller's transaction.
 */

import { GrillState } from '@forge/core';
import type {
  EscalationAnswer,
  EscalationFailure,
  Interaction,
  StorageTx,
  Ticket,
} from '@forge/core';
import { conflictFromPayload, conflictWakeReason } from '#/domain/conflict-wake.js';
import { retryContext } from '#/domain/retry-context.js';
import { readRetryFacts } from '#/tick/retry-facts.js';
import { resetFallbackTx } from '#/tick/no-agent.js';
import { logCardEvent } from '#/tick/card-log.js';
import { moveCardTx } from '#/tick/card-phase.js';
import { settleEscalation } from '#/tick/escalation-settle.js';
import { grillIndex } from '#/tick/plan-actions.js';
import { setNeedsYou } from '#/tick/planning-state.js';
import { moveTicketTx } from '#/tick/ticket-moves.js';
import { heldFindingsText, heldRows } from '#/tick/escalation-override.js';
import { requestReworkWakesTx } from '#/tick/rework-wakes.js';
import { finishStageRun, humanStageId, sendBackFromHuman } from '#/tick/stage-records.js';
import { requestWakeTx } from '#/tick/wakes.js';
import type { EngineDeps } from '#/types/engine.types.js';
import type { EffectEnd } from '#/types/escalation.types.js';

/** A card the Director can re-plan through: the ticket has one, and it is not a Discussion. */
export async function replannable(tx: StorageTx, ticket: Ticket): Promise<boolean> {
  const card = ticket.card_id === undefined ? null : await tx.cards.get(ticket.card_id);

  return card !== null && card.type !== 'discussion' && card.closed_reason === undefined;
}

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

  // A stage that ran out of places to run starts its chain over from its agent's own place (the owner's Retry).
  if (
    answer.action === 'retry' &&
    (row.payload as { cause?: string } | null)?.cause === 'no_agent_available'
  ) {
    await resetFallbackTx(tx, ticket.id);
  }

  if (moved.ticket.status === 'planned') {
    // A clash with main: the writer gets the clash again (files, upstream tickets) with the owner's note.
    // The conflict count stays at its cap, so this is exactly one more attempt, and the ticket
    // goes to Planned (the park has no `parked_from`), so a Worker really runs.
    const conflict = (row.payload as EscalationFailure | null)?.conflict;
    if (
      answer.action === 'retry' &&
      (row.payload as EscalationFailure | null)?.cause === 'merge_conflict'
    ) {
      await requestWakeTx(tx, deps, {
        ticketId: ticket.id,
        kind: 'continuation',
        reason: conflictWakeReason(conflictFromPayload(conflict, answer.note)),
        key: row.id,
        uncapped: true,
      });

      return 'done';
    }

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

  // Read before settling: the stop the owner is re-planning from, in the same words a retry gets.
  const stop = retryContext(await readRetryFacts(tx, ticket, row.id));

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
    payload: {
      ticket_id: ticket.id,
      comment,
      by: 'owner',
      ...(stop ? { stop: { ...stop } } : {}),
    },
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
    replan_from: stop ? { ticket_id: ticket.id, stop: { ...stop } } : null,
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
 * Sends finished work back to its Worker: the `rework` event moves a ticket in review, waiting for
 * sign-off, or held from verifying to In Progress, and a continuation wake carries the owner's
 * comment (and, for a hold, the held findings) to the next run's prompt, one wake per member when
 * the work goes back to a writer group. A hold sends back without spending an automatic rework: the
 * held stage rows fail, which ends the cycle so the next one restarts at the writer. False when the
 * ticket is not in a state that can be reworked.
 */
export async function reworkTx(
  deps: EngineDeps,
  tx: StorageTx,
  nowIso: string,
  ticketId: string,
  comment: string,
): Promise<boolean> {
  const held = await heldRows(tx, ticketId);
  const moved = await moveTicketTx(tx, ticketId, nowIso, (t) =>
    t.status === 'review' ||
    t.status === 'needs_signoff' ||
    (t.status === 'waiting_human' && t.parked_from === 'verifying')
      ? { events: [{ type: 'rework' }], reason: `Sent back: ${comment.slice(0, 300)}` }
      : null,
  );

  if (!moved.ok) {
    return false;
  }

  // The owner's send-back ends the pipeline's cycle: the next one restarts at the writer.
  let from = 'merge';
  if (held.length > 0) {
    for (const h of held) {
      await finishStageRun(tx, h.id, 'failed', h.outcome, nowIso);
    }

    from = held[0]?.stage_id ?? from;
  } else {
    const snapshot = await tx.ticketPipelines.get(ticketId);
    from = snapshot ? humanStageId(snapshot) : from;
    await sendBackFromHuman(tx, nowIso, ticketId);
  }

  const findings = heldFindingsText(held);
  await requestReworkWakesTx(
    deps,
    tx,
    ticketId,
    from,
    `owner_rework: ${comment}${findings === '' ? '' : `\n\nFindings that held the merge:\n${findings}`}`,
    `rework-${moved.ticket.status_version}`,
  );

  return true;
}
