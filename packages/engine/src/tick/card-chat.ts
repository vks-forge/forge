/**
 * Card chat phase: the Director answers the user on a card, and acts if it needs to.
 *
 * Why: the card's Director is the user's counterpart for the whole request (d-0109). Each tick
 *   it claims the replies it owes from the durable `card_reply_queue` (a new card, or a
 *   message the owner wrote) and answers each card once, in one `card_chat` model step whose
 *   output is parsed against a core schema (rule 4). Because the debt is stored, a restart
 *   resumes unclaimed rows, and a claim whose process died is taken again after ten minutes
 *   (d-0134). Its actions run first, each through its existing door and logged, then its
 *   reply is written with the list of what was done or refused, and the claimed rows are
 *   completed in that same transaction, so the user reads the reply and sees the same truth
 *   the history holds, and a crash cannot answer twice. A bad answer (off-schema twice, a
 *   model outage) never crashes the tick: the card shows `error` with a plain note, the rows
 *   are completed, and the user's next message tries again. Spend is checked for a budget
 *   warning after each answer, and its cost joins the card's Director spend (d-0143). The phase runs before triage so a ticket the
 *   Director files is triaged in the same tick. Cards of a planned type in a planning phase
 *   are not chatted with: their queued turns are planning turns and go to the planning flow
 *   (tick/card-planning); only cards outside planning (and Discussion cards) use `card_chat`.
 *
 * Exports: runCardChats(), STALE_CLAIM_MS.
 * Depends on: @forge/core (CardChatOutput), steps/run-step, tick/card-budget, tick/card-planning,
 *   tick/card-chat-actions, tick/card-chat-context, tick/card-log, tick/card-notify.
 *   Reads and writes storage.
 */

import { CardChatOutput } from '@forge/core';
import type { ActionTaken, CardId, CardReplyQueueItem, StorageTx } from '@forge/core';
import { iso } from '#/shared/time.js';
import { rejectStep, runStep } from '#/steps/run-step.js';
import { addDirectorSpend, warnOnBudget } from '#/tick/card-budget.js';
import { CHAT_ACTOR, runChatAction } from '#/tick/card-chat-actions.js';
import { loadChatContext } from '#/tick/card-chat-context.js';
import { logCardEvent } from '#/tick/card-log.js';
import { notifyCard } from '#/tick/card-notify.js';
import { noteFailure, planningHandles, runPlanningTurn } from '#/tick/card-planning.js';
import type { EngineCtx } from '#/types/engine-state.types.js';

/** A claim older than this was left by a process that died mid-answer; the row is answered again. */
export const STALE_CLAIM_MS = 10 * 60 * 1000;

/** Marks the claimed rows done; a row already done is left alone. */
async function completeRows(
  tx: StorageTx,
  rows: readonly number[],
  at: string,
): Promise<void> {
  for (const id of rows) {
    await tx.cardReplyQueue.complete(id, at);
  }
}

/** Marks the card's reply as failed and tells the user in the history. */
async function failChat(
  ctx: EngineCtx,
  cardId: CardId,
  rows: readonly number[],
  reason: string,
): Promise<void> {
  ctx.state.chat.errors.set(cardId, reason);
  await ctx.deps.storage.transaction(async (tx) => {
    await logCardEvent(tx, cardId, {
      kind: 'note',
      at: ctx.nowIso,
      actor: CHAT_ACTOR,
      payload: {
        text: `The Director could not answer just now (${reason}). Send your message again to retry.`,
      },
    });

    await completeRows(tx, rows, ctx.nowIso);
  });
}

async function answerCard(
  ctx: EngineCtx,
  cardId: CardId,
  rows: readonly number[],
): Promise<void> {
  const view = await loadChatContext(ctx, cardId);
  if (!view) {
    return;
  }

  let cost = 0;
  const answer = await runStep(ctx, 'card_chat', view.input, CardChatOutput, {
    onCost: (usd) => {
      cost += usd;
    },
  });

  if (!answer.ok) {
    // The step key is the card id: `rejectStep` records it where it records a ticket id.
    rejectStep(ctx, 'card_chat', cardId, answer.error);

    return failChat(ctx, cardId, rows, `${answer.error.kind}: ${answer.error.message}`);
  }

  const taken: ActionTaken[] = [];
  for (const action of answer.value.actions) {
    taken.push(await runChatAction(ctx, cardId, action));
  }

  await ctx.deps.storage.transaction(async (tx) => {
    await logCardEvent(tx, cardId, {
      kind: 'director_message',
      at: ctx.nowIso,
      actor: CHAT_ACTOR,
      payload: {
        text: answer.value.reply,
        ...(taken.length > 0 ? { actions_taken: taken } : {}),
      },
    });

    await addDirectorSpend(tx, cardId, cost, ctx.nowIso);
    await warnOnBudget(tx, cardId, ctx.nowIso);
    await completeRows(tx, rows, ctx.nowIso);
  });

  ctx.state.chat.errors.delete(cardId);
}

/** Answers every card with a queued reply; a failure on one card does not stop the others. */
export async function runCardChats(ctx: EngineCtx): Promise<void> {
  const { pending, busy } = ctx.state.chat;
  const claimed = await ctx.deps.storage.transaction((tx) =>
    tx.cardReplyQueue.claim(ctx.nowIso, iso(ctx.now - STALE_CLAIM_MS)),
  );

  // One turn per card however many messages queued up: the step reads the whole history.
  const byCard = new Map<CardId, CardReplyQueueItem[]>();
  for (const row of claimed) {
    byCard.set(row.card_id, [...(byCard.get(row.card_id) ?? []), row]);
  }

  for (const [id, items] of byCard) {
    const rows = items.map((r) => r.id);
    // A planning turn that failed leaves its rows claimed: they are taken again once stale.
    let retry = false;
    pending.delete(id);
    busy.add(id);
    try {
      if (await planningHandles(ctx, id)) {
        retry = (await runPlanningTurn(ctx, id, items)) === 'retry';
      } else {
        await answerCard(ctx, id, rows);
      }
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      ctx.deps.log?.('error', `card chat ${id} failed`, { error: reason });
      if (await planningHandles(ctx, id).catch(() => false)) {
        retry = true;
        await noteFailure(ctx, id, reason).catch(() => undefined);
      } else {
        await failChat(ctx, id, rows, reason);
      }
    } finally {
      busy.delete(id);
      // Rows of a card that is closed or gone have no reply to wait for.
      if (!retry) {
        await ctx.deps.storage.transaction((tx) => completeRows(tx, rows, ctx.nowIso));
      }

      await notifyCard(ctx.deps, id);
    }
  }
}
