/**
 * Card chat phase: the Director answers the user on a card, and acts if it needs to.
 *
 * Why: the card's Director is the user's counterpart for the whole request (d-0109). Each tick
 *   it answers every card that has an unanswered user message, in one `card_chat` model step
 *   whose output is parsed against a core schema (rule 4). Its actions run first, each through
 *   its existing door and logged, then its reply is written with the list of what was done or
 *   refused, so the user reads the reply and sees the same truth the history holds. A bad
 *   answer (off-schema twice, a model outage) never crashes the tick: the card shows `error`
 *   with a plain note, and the user's next message tries again. The phase runs before triage
 *   so a ticket the Director files is triaged in the same tick.
 *
 * Exports: runCardChats().
 * Depends on: @forge/core (CardChatOutput), steps/run-step, tick/card-chat-actions,
 *   tick/card-chat-context, tick/card-log. Reads and writes storage.
 */

import { CardChatOutput } from '@forge/core';
import type { ActionTaken, CardId } from '@forge/core';
import { rejectStep, runStep } from '#/steps/run-step.js';
import { CHAT_ACTOR, runChatAction } from '#/tick/card-chat-actions.js';
import { loadChatContext } from '#/tick/card-chat-context.js';
import { logCardEvent } from '#/tick/card-log.js';
import type { EngineCtx } from '#/types/engine-state.types.js';

/** Marks the card's reply as failed and tells the user in the history. */
async function failChat(ctx: EngineCtx, cardId: CardId, reason: string): Promise<void> {
  ctx.state.chat.errors.set(cardId, reason);
  await ctx.deps.storage.transaction((tx) =>
    logCardEvent(tx, cardId, {
      kind: 'note',
      at: ctx.nowIso,
      actor: CHAT_ACTOR,
      payload: {
        text: `The Director could not answer just now (${reason}). Send your message again to retry.`,
      },
    }),
  );
}

async function answerCard(ctx: EngineCtx, cardId: CardId): Promise<void> {
  const view = await loadChatContext(ctx.deps, cardId);
  if (!view) {
    return;
  }

  const answer = await runStep(ctx, 'card_chat', view.input, CardChatOutput);
  if (!answer.ok) {
    // The step key is the card id: `rejectStep` records it where it records a ticket id.
    rejectStep(ctx, 'card_chat', cardId, answer.error);

    return failChat(ctx, cardId, `${answer.error.kind}: ${answer.error.message}`);
  }

  const taken: ActionTaken[] = [];
  for (const action of answer.value.actions) {
    taken.push(await runChatAction(ctx, cardId, action));
  }

  await ctx.deps.storage.transaction((tx) =>
    logCardEvent(tx, cardId, {
      kind: 'director_message',
      at: ctx.nowIso,
      actor: CHAT_ACTOR,
      payload: {
        text: answer.value.reply,
        ...(taken.length > 0 ? { actions_taken: taken } : {}),
      },
    }),
  );

  ctx.state.chat.errors.delete(cardId);
}

/** Answers every card with a pending user message; a failure on one card does not stop the others. */
export async function runCardChats(ctx: EngineCtx): Promise<void> {
  const { pending, busy } = ctx.state.chat;
  const ids = [...pending] as CardId[];
  for (const id of ids) {
    pending.delete(id);
    busy.add(id);
    try {
      await answerCard(ctx, id);
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      ctx.deps.log?.('error', `card chat ${id} failed`, { error: reason });
      await failChat(ctx, id, reason);
    } finally {
      busy.delete(id);
    }
  }
}
