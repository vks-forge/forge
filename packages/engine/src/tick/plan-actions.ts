/**
 * Plan actions: request changes, start planning, retry a stopped step.
 *
 * Why: the owner stays in charge of every plan (d-0133). Request changes sends a ready plan back
 *   for a re-grill on the comment only, then the next version with a computed diff; Start planning
 *   gives a card backfilled from before planning existed a way in (no dead card). Both work on a
 *   card that is waiting (`phase_mismatch` otherwise) and, for Request changes, on the latest version
 *   only (an older one is `stale_plan`), so two tabs or a late click cannot act on a plan already
 *   replaced. Each queues the Director's next turn in the same transaction, so a restart loses nothing.
 *
 *   Retry step is the way out of a Director step that ran out of its budget: the card waits on the
 *   owner with the step unfinished, and the retry queues the turn that resumes at that same step.
 *
 * Exports: grillIndex(), requestPlanChanges(), startPlanning(), retryPlanningStep().
 * Depends on: @forge/core (flow and card types), tick/planning-state, tick/card-phase, tick/card-log,
 *   tick/card-notify, tick/tick-requests, types/card-planning. Writes storage.
 */

import { CardId } from '@forge/core';
import type { DirectorFlow, StorageTx } from '@forge/core';
import { iso } from '#/shared/time.js';
import { logCardEvent } from '#/tick/card-log.js';
import { notifyCard } from '#/tick/card-notify.js';
import { moveCardTx } from '#/tick/card-phase.js';
import { isPlannedType, logPlanEvent, setNeedsYou } from '#/tick/planning-state.js';
import { requestTick } from '#/tick/tick-requests.js';
import type {
  RequestChangesResult,
  RetryPlanningResult,
  StartPlanningResult,
} from '#/types/card-planning.types.js';
import type { EngineState } from '#/types/engine-state.types.js';
import type { EngineDeps } from '#/types/engine.types.js';

const MIN_COMMENT = 5;

/** Where a re-grill resumes: the first enabled grill step of the card's flow snapshot, else the start. */
export function grillIndex(flow: DirectorFlow | null): number {
  const at = flow?.findIndex((s) => s.kind === 'grill' && s.enabled) ?? -1;

  return Math.max(0, at);
}

/** Queues the Director's next planning turn and announces the change to live views. */
async function wake(
  state: EngineState,
  cardId: CardId,
  tx: StorageTx,
  eventSeq: number,
  reason: 'plan_changes' | 'start_planning',
  at: string,
): Promise<void> {
  await tx.cardReplyQueue.enqueue({
    card_id: cardId,
    event_id: eventSeq,
    reason,
    enqueued_at: at,
  });

  state.chat.pending.add(cardId);
}

/** `POST /cards/:id/plan/request-changes`: sends the plan back; the Director re-grills on the comment only. */
export async function requestPlanChanges(
  deps: EngineDeps,
  state: EngineState,
  cardId: string,
  version: number,
  comment: string,
  author: string,
): Promise<RequestChangesResult> {
  const id = CardId.safeParse(cardId);
  if (!id.success) {
    return { status: 'not_found' };
  }

  const at = iso(deps.clock.now());
  const text = comment.trim();
  const result = await deps.storage.transaction(
    async (tx): Promise<RequestChangesResult> => {
      const card = await tx.cards.get(id.data);
      if (!card) {
        return { status: 'not_found' };
      }

      if (card.phase !== 'plan_ready') {
        return { status: 'phase_mismatch' };
      }

      const latest = await tx.cardPlanning.latestPlan(card.id);
      if (!latest || latest.version !== version) {
        return { status: 'stale_plan' };
      }

      if (text.length < MIN_COMMENT) {
        return { status: 'invalid_comment' };
      }

      const planning = await tx.cardPlanning.get(card.id);
      const event = await logCardEvent(tx, card.id, {
        kind: 'plan_changes_requested',
        at,
        actor: { type: 'user', id: author },
        payload: { version, comment: text },
      });

      await tx.cardPlanning.update(card.id, {
        flow_cursor: grillIndex(planning.flow),
        grill: {
          ...planning.grill,
          pending_changes: { version, comment: text },
          done: false,
          done_reason: null,
          current: null,
          queued: [],
          round_asked: 0,
          round_open: false,
          open_points: null,
          floor: null,
        },
      });

      await moveCardTx(tx, card.id, { type: 'regrill' }, at);
      await setNeedsYou(tx, card.id, false, at);
      await wake(state, card.id, tx, event?.seq ?? 0, 'plan_changes', at);

      return { status: 'requested', card: (await tx.cards.get(card.id)) ?? card };
    },
  );

  if (result.status === 'requested') {
    requestTick(deps, state);
    await notifyCard(deps, id.data);
  }

  return result;
}

/** `POST /cards/:id/start-planning`: a card backfilled from before planning existed enters the grill. */
export async function startPlanning(
  deps: EngineDeps,
  state: EngineState,
  cardId: string,
  author: string,
): Promise<StartPlanningResult> {
  const id = CardId.safeParse(cardId);
  if (!id.success) {
    return { status: 'not_found' };
  }

  const at = iso(deps.clock.now());
  const result = await deps.storage.transaction(
    async (tx): Promise<StartPlanningResult> => {
      const card = await tx.cards.get(id.data);
      if (!card) {
        return { status: 'not_found' };
      }

      const type = await tx.cardTypes.get(card.type);
      if (!type || !isPlannedType(type)) {
        return { status: 'not_plannable' };
      }

      const planning = await tx.cardPlanning.get(card.id);
      const planned = (await tx.cardPlanning.latestPlan(card.id)) !== null;
      if (card.phase !== 'plan_ready' || planning.flow !== null || planned) {
        return { status: 'phase_mismatch' };
      }

      await moveCardTx(tx, card.id, { type: 'regrill' }, at);
      await setNeedsYou(tx, card.id, false, at);
      await logPlanEvent(tx, card.id, at, {
        kind: 'note',
        payload: {
          text: `Planning started by ${author}. The Director will ask what it needs.`,
        },
      });

      const last = (await tx.cardEvents.list(card.id, { order: 'desc', limit: 1 }))[0];
      await wake(state, card.id, tx, last?.seq ?? 0, 'start_planning', at);

      return { status: 'started', card: (await tx.cards.get(card.id)) ?? card };
    },
  );

  if (result.status === 'started') {
    requestTick(deps, state);
    await notifyCard(deps, id.data);
  }

  return result;
}

/**
 * `POST /cards/:id/planning/retry`: re-runs the planning step that stopped on its budget. Only a
 * card still being shaped that waits on the owner (and has a flow, so a step has run) may retry;
 * the turn resumes at the stored cursor, which a failed step never advanced.
 */
export async function retryPlanningStep(
  deps: EngineDeps,
  state: EngineState,
  cardId: string,
  author: string,
): Promise<RetryPlanningResult> {
  const id = CardId.safeParse(cardId);
  if (!id.success) {
    return { status: 'not_found' };
  }

  const at = iso(deps.clock.now());
  const result = await deps.storage.transaction(
    async (tx): Promise<RetryPlanningResult> => {
      const card = await tx.cards.get(id.data);
      if (!card) {
        return { status: 'not_found' };
      }

      const planning = await tx.cardPlanning.get(card.id);
      const events = await tx.cardEvents.list(card.id, { order: 'desc', limit: 20 });
      const stopped = events.find((e) => e.kind === 'needs_you');
      const budgetStop =
        stopped?.kind === 'needs_you' && stopped.payload.actions.includes('retry_step');

      const shaping = card.phase === 'grilling' || card.phase === 'verifying';
      if (!shaping || !card.needs_you || planning.flow === null || !budgetStop) {
        return { status: 'phase_mismatch' };
      }

      await setNeedsYou(tx, card.id, false, at);
      await logPlanEvent(tx, card.id, at, {
        kind: 'note',
        payload: { text: `Step retried by ${author}.` },
      });

      const last = (await tx.cardEvents.list(card.id, { order: 'desc', limit: 1 }))[0];
      // `start_planning` is the queue's plain "run the flow now" wake; the cursor decides the step.
      await wake(state, card.id, tx, last?.seq ?? 0, 'start_planning', at);

      return { status: 'retried', card: (await tx.cards.get(card.id)) ?? card };
    },
  );

  if (result.status === 'retried') {
    requestTick(deps, state);
    await notifyCard(deps, id.data);
  }

  return result;
}
