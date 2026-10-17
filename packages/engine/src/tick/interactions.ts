/**
 * Interactions: answering a parked ticket's question, and expiring one nobody answers.
 *
 * Why: a Worker that needs a human pauses and the ticket parks in WaitingHuman with the
 *   interaction as its durable reason (director-core.md §8). The answer must be accepted
 *   exactly once (a human, the Director's first look and a timeout cannot all resolve it) and
 *   must wake the ticket through the wake queue so the resume is a normal dispatch. A question
 *   nobody answers for `interaction_timeout_ms` must not leave the ticket waiting silently
 *   forever: it moves to Blocked and the owner gets a failure escalation (retry, re-plan or
 *   cancel) rather than a dead end, so the timeout never removes the owner's way forward.
 *   Failures and setups never expire: they are not questions a Worker is waiting on.
 *
 * Exports: answerQuestionTx(), answerInteraction(), answerPending(), expireInteractions().
 * Depends on: @forge/core (interaction port, escalation schemas), domain/escalation-answer,
 *   tick/card-log, tick/escalation-raise, tick/escalation-settle, tick/wakes, tick/ticket-moves,
 *   tick/tick-requests.
 */

import { toEscalation } from '@forge/core';
import type { EscalationAnswer, Interaction, StorageTx, Ticket } from '@forge/core';
import { asAnswerRecord } from '#/domain/escalation-answer.js';
import { ENGINE_ACTOR, logCardEvent } from '#/tick/card-log.js';
import { raiseEscalation } from '#/tick/escalation-raise.js';
import { settleEscalation } from '#/tick/escalation-settle.js';
import { requestTick } from '#/tick/tick-requests.js';
import { moveTicketTx } from '#/tick/ticket-moves.js';
import { requestWakeTx } from '#/tick/wakes.js';
import type { EngineCtx, EngineState } from '#/types/engine-state.types.js';
import type { EngineDeps } from '#/types/engine.types.js';

/** Interaction kinds a Worker is waiting on and that therefore expire. */
const QUESTION_KINDS: readonly Interaction['kind'][] = [
  'question',
  'plan_confirm',
  'permission',
  'blocked',
];

/**
 * Settles a pending question with `answer` and queues the response wake that resumes the
 * Worker; false when it was not pending. Inside the caller's transaction.
 */
export async function answerQuestionTx(
  deps: EngineDeps,
  tx: StorageTx,
  row: Interaction,
  answer: EscalationAnswer,
  author = 'owner',
): Promise<boolean> {
  const ticket = await tx.tickets.get(row.ticket_id as Ticket['id']);
  const card = row.card_id ?? ticket?.card_id;
  const nowIso = new Date(deps.clock.now()).toISOString();
  if (!(await settleEscalation(tx, nowIso, { ...row, card_id: card }, answer, author))) {
    return false;
  }

  await logCardEvent(tx, card, {
    kind: 'interaction_answered',
    at: nowIso,
    actor: answer.by === 'owner' ? { type: 'user', id: author } : ENGINE_ACTOR,
    payload: { ticket_id: row.ticket_id as Ticket['id'], interaction_id: row.id },
  });

  await requestWakeTx(tx, deps, {
    ticketId: row.ticket_id,
    kind: 'response_wake',
    reason: 'answered',
    key: row.id,
  });

  return true;
}

/** Answers a pending interaction by id with the owner's raw answer; false when unknown or no longer pending. */
export async function answerInteraction(
  deps: EngineDeps,
  state: EngineState,
  id: string,
  answer: unknown,
): Promise<boolean> {
  const won = await deps.storage.transaction(async (tx) => {
    const row = await tx.interactions.get(id);

    return row ? answerQuestionTx(deps, tx, row, asAnswerRecord(answer)) : false;
  });

  if (won) {
    requestTick(deps, state);
  }

  return won;
}

/** A chat reply answers a ticket's single pending question; returns its id, else null. */
export async function answerPending(
  deps: EngineDeps,
  tx: StorageTx,
  ticket: Ticket,
  text: string,
): Promise<string | null> {
  if (ticket.status !== 'waiting_human') {
    return null;
  }

  // Only a question takes a typed reply: a failure or a setup is acted on, not answered.
  const pending = (await tx.interactions.listByTicket(ticket.id)).filter(
    (i) => i.status === 'pending' && toEscalation(i).kind === 'question',
  );

  const only = pending.length === 1 ? pending[0] : undefined;
  if (!only) {
    return null;
  }

  return (await answerQuestionTx(deps, tx, only, asAnswerRecord(text))) ? only.id : null;
}

/** Expires overdue questions, blocks their tickets with a reason and gives the owner a way forward. */
export async function expireInteractions(ctx: EngineCtx): Promise<void> {
  const { storage } = ctx.deps;
  const pending = await storage.transaction((tx) => tx.interactions.listPending());
  for (const i of pending) {
    if (!QUESTION_KINDS.includes(i.kind) || Date.parse(i.timeout_at) > ctx.now) {
      continue;
    }

    await storage.transaction(async (tx) => {
      if (!(await tx.interactions.expire(i.id, ctx.nowIso))) {
        return;
      }

      const reason = `question timed out unanswered (${i.id})`;
      const moved = await moveTicketTx(tx, i.ticket_id, ctx.nowIso, (t) =>
        t.status === 'waiting_human' ? { events: [{ type: 'blocked', reason }] } : null,
      );

      if (!moved.ok) {
        return;
      }

      // The timeout moves the ticket to Blocked; the owner is told and offered retry, re-plan or cancel.
      await raiseEscalation(
        tx,
        ctx.deps,
        ctx.nowIso,
        moved.ticket,
        {
          kind: 'failure',
          cause: 'question_timeout',
          summary: `The Worker's question went unanswered for too long: ${clip(promptOf(i))}`,
          attempts: [],
        },
        'owner',
        i.run_id,
      );

      ctx.deps.log?.('info', `interaction ${i.id} timed out`, { ticket: i.ticket_id });
    });
  }
}

const clip = (text: string): string =>
  text.length > 160 ? `${text.slice(0, 159)}…` : text;

/** The question's own words, for the summary of its timeout. */
function promptOf(row: Interaction): string {
  const view = toEscalation(row);

  return view.payload.kind === 'question' ? view.payload.text : '(question)';
}
