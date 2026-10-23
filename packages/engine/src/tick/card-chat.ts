/**
 * Card chat phase: the Director answers the user on a card, and acts if it needs to.
 *
 * Why: the card's Director is the user's counterpart for the whole request (d-0109). Each tick
 *   it claims the replies it owes from the durable `card_reply_queue` (a new card, or a
 *   message the owner wrote) and starts one job per card (tick/director-jobs), so a slow turn
 *   never holds up the tick or another card; a card has at most one turn in flight, and the
 *   claim takes only as many cards as there are free Director slots, owner messages first, so
 *   a card with no slot keeps its rows unclaimed instead of stranded. A turn answers its
 *   card once, in one `card_chat` model step whose
 *   output is parsed against a core schema (rule 4). Because the debt is stored, a restart
 *   resumes it: claims held at boot belong to the dead process and are released on the first
 *   tick, and a claim that goes stale while a turn hangs is taken again after ten minutes
 *   (d-0134). Writes after a model call carry the clock now, not the tick's start. Its actions run first, each through its existing door and logged, then its
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
 * Exports: runCardChats(), releaseCardClaims(), STALE_CLAIM_MS.
 * Depends on: @forge/core (CardChatOutput), steps/run-step, tick/director-jobs, tick/card-budget, tick/card-planning,
 *   tick/card-chat-actions, tick/card-chat-context, tick/card-log, tick/card-notify.
 *   Reads and writes storage.
 */

import { CardChatOutput } from '@forge/core';
import type { ActionTaken, CardId, CardReplyQueueItem, StorageTx } from '@forge/core';
import { iso } from '#/shared/time.js';
import { rejectStep, runStep } from '#/steps/run-step.js';
import { addDirectorSpend, warnLevelForCard, warnOnBudget } from '#/tick/card-budget.js';
import { runChatAction } from '#/tick/card-chat-actions.js';
import { CHAT_ACTOR } from '#/tick/card-chat-gate.js';
import { loadChatContext } from '#/tick/card-chat-context.js';
import { logCardEvent } from '#/tick/card-log.js';
import { notifyCard } from '#/tick/card-notify.js';
import { noteFailure, planningHandles, runPlanningTurn } from '#/tick/card-planning.js';
import {
  cardKey,
  cardsInFlight,
  directorSlots,
  liveCtx,
  startDirectorJob,
} from '#/tick/director-jobs.js';
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
  const at = liveCtx(ctx).nowIso;
  await ctx.deps.storage.transaction(async (tx) => {
    await logCardEvent(tx, cardId, {
      kind: 'note',
      at,
      actor: CHAT_ACTOR,
      payload: {
        text: `The Director could not answer just now (${reason}). Send your message again to retry.`,
      },
    });

    await completeRows(tx, rows, at);
  });
}

/** A failed chat step still spent what its harness reported: the ledger and the card total count it. */
async function recordFailedChatSpend(
  ctx: EngineCtx,
  cardId: CardId,
  cost: number,
  reported: boolean,
): Promise<void> {
  const at = liveCtx(ctx).nowIso;
  await ctx.deps.storage.transaction(async (tx) =>
    addDirectorSpend(tx, cardId, cost, at, await warnLevelForCard(ctx, tx, cardId), {
      kind: 'card_chat',
      model: ctx.config.forge.models.director['card_chat'],
      recorded: reported,
    }),
  );
}

/**
 * What the owner said in the messages that triggered this turn (reason `user_message`, written by a
 * person). Escalations, Worker blocks, system events and Director steps contribute nothing, so they
 * can never authorize a cancel (d-0179).
 */
async function ownerWords(
  ctx: EngineCtx,
  cardId: CardId,
  items: readonly CardReplyQueueItem[],
): Promise<string> {
  const seqs = new Set(
    items.filter((i) => i.reason === 'user_message').map((i) => i.event_id),
  );

  if (seqs.size === 0) {
    return '';
  }

  const texts: string[] = [];
  await ctx.deps.storage.transaction(async (tx) => {
    for (const seq of seqs) {
      const [e] = await tx.cardEvents.list(cardId, { afterSeq: seq - 1, limit: 1 });
      if (e?.seq === seq && e.kind === 'user_message' && e.actor.type === 'user') {
        texts.push(e.payload.text);
      }
    }
  });

  return texts.join('\n');
}

async function answerCard(
  ctx: EngineCtx,
  cardId: CardId,
  items: readonly CardReplyQueueItem[],
): Promise<void> {
  const rows = items.map((r) => r.id);
  const view = await loadChatContext(ctx, cardId);
  if (!view) {
    return;
  }

  let cost = 0;
  let reported = false;
  const answer = await runStep(ctx, 'card_chat', view.input, CardChatOutput, {
    onCost: (usd) => {
      cost += usd;
      reported = true;
    },
  });

  if (!answer.ok) {
    // The step key is the card id: `rejectStep` records it where it records a ticket id.
    rejectStep(ctx, 'card_chat', cardId, answer.error);
    await recordFailedChatSpend(ctx, cardId, cost, reported);

    return failChat(ctx, cardId, rows, `${answer.error.kind}: ${answer.error.message}`);
  }

  // The model call took as long as it took: what follows is stamped with the clock now.
  const live = liveCtx(ctx);
  const taken: ActionTaken[] = [];
  const turn = { ownerText: await ownerWords(ctx, cardId, items) };
  for (const action of answer.value.actions) {
    taken.push(await runChatAction(live, cardId, action, turn));
  }

  const at = liveCtx(ctx).nowIso;
  await ctx.deps.storage.transaction(async (tx) => {
    await logCardEvent(tx, cardId, {
      kind: 'director_message',
      at,
      actor: CHAT_ACTOR,
      payload: {
        text: answer.value.reply,
        ...(taken.length > 0 ? { actions_taken: taken } : {}),
      },
    });

    const level = await warnLevelForCard(ctx, tx, cardId);
    await addDirectorSpend(tx, cardId, cost, at, level, {
      kind: 'card_chat',
      model: ctx.config.forge.models.director['card_chat'],
      recorded: reported,
    });

    await warnOnBudget(tx, cardId, at, level);
    await completeRows(tx, rows, at);
  });

  ctx.state.chat.errors.delete(cardId);
}

/** One card's turn, run as a job: a planning turn or a `card_chat` answer; a failure stays on this card. */
async function cardTurn(
  ctx: EngineCtx,
  id: CardId,
  items: readonly CardReplyQueueItem[],
): Promise<void> {
  const { busy } = ctx.state.chat;
  const rows = items.map((r) => r.id);
  // A planning turn that failed leaves its rows claimed: they are taken again once stale.
  let retry = false;
  busy.add(id);
  try {
    if (await planningHandles(ctx, id)) {
      retry = (await runPlanningTurn(ctx, id, items)) === 'retry';
    } else {
      await answerCard(ctx, id, items);
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
      const at = liveCtx(ctx).nowIso;
      await ctx.deps.storage.transaction((tx) => completeRows(tx, rows, at));
    }

    await notifyCard(ctx.deps, id);
  }
}

/**
 * Starts a turn job for each card with a queued reply, as many as there are free Director slots and
 * never a second one for a card already in flight. Owner messages are claimed first, then the oldest
 * row. Returns at once: the turns run beside the tick.
 */
export async function runCardChats(ctx: EngineCtx): Promise<void> {
  const free = directorSlots(ctx);
  if (free === 0) {
    return;
  }

  const claimed = await ctx.deps.storage.transaction((tx) =>
    tx.cardReplyQueue.claim(ctx.nowIso, iso(ctx.now - STALE_CLAIM_MS), {
      exclude: cardsInFlight(ctx.state) as CardId[],
      maxCards: free,
    }),
  );

  // One turn per card however many messages queued up: the step reads the whole history.
  const byCard = new Map<CardId, CardReplyQueueItem[]>();
  for (const row of claimed) {
    byCard.set(row.card_id, [...(byCard.get(row.card_id) ?? []), row]);
  }

  for (const [id, items] of byCard) {
    ctx.state.chat.pending.delete(id);
    startDirectorJob(ctx, {
      key: cardKey(id),
      kind: 'card_turn',
      subject: id,
      run: (job) => cardTurn(job, id, items),
    });
  }
}

/** First tick: every claim found at boot was held by a process that died, so its rows are answered now. */
export async function releaseCardClaims(ctx: EngineCtx): Promise<void> {
  const released = await ctx.deps.storage.transaction((tx) =>
    tx.cardReplyQueue.releaseClaims(),
  );

  if (released > 0) {
    ctx.deps.log?.(
      'info',
      `released ${released} card replies claimed before the restart`,
    );
  }
}
