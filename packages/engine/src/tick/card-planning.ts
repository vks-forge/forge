/**
 * Card planning: the flow runner that plans a card one Director step at a time.
 *
 * Why: before any ticket exists the Director grills the owner, verifies against the code,
 *   enhances the decisions, writes a versioned plan and gets it approved (d-0130 to d-0133). The
 *   card carries an ordered step list (a snapshot taken when planning starts, so editing the
 *   flow later never changes a card already planning, d-0146) and a cursor into it. Each tick
 *   this runner claims the card's owed turns from the durable queue and walks the flow from the
 *   cursor: one Director call per step, each step recorded in one transaction, until a step needs
 *   the owner (a question, an approval) or the flow ends. Everything it knows is stored, so a
 *   restart resumes at the right step. The phase moves only through `transitionCard()`. Cards of
 *   a Discussion type, or whose type files tickets at intake, never enter the flow (they chat).
 *   An owner's chat message during planning answers the open question rather than starting a
 *   second conversation. A step that fails is retried after its queued turn goes stale.
 *
 * Exports: planningHandles(), runPlanningTurn().
 * Depends on: @forge/core (flow cursor, queue items), tick/planning-*, tick/plan-to-tickets,
 *   tick/card-log, tick/card-phase, types/card-planning. Reads and writes storage.
 */

import { resolveFlowStep } from '@forge/core';
import type { CardId, CardPhase, CardReplyQueueItem, FlowStep } from '@forge/core';
import { logCardEvent } from '#/tick/card-log.js';
import { askQueued, grillStep, recordAnswerTx } from '#/tick/planning-grill.js';
import { approveStep, writePlanStep } from '#/tick/planning-plan.js';
import {
  isPlannedType,
  isPlanningPhase,
  loadPlanCtx,
  logPlanEvent,
} from '#/tick/planning-state.js';
import {
  customStep,
  enhanceStep,
  surveyStep,
  verifyStep,
} from '#/tick/planning-steps.js';
import type { CardPlanningState } from '@forge/core';
import type { FlowEnd, PlanCtx, StepOutcome } from '#/types/card-planning.types.js';
import type { EngineCtx } from '#/types/engine-state.types.js';

/** A turn runs at most this many steps, so a misconfigured flow can never spin a tick. */
const MAX_STEPS_PER_TURN = 40;

const isShaping = (phase: CardPhase): boolean =>
  phase === 'grilling' || phase === 'verifying';

/** Whether the card's Director turns are planning turns: a planned type in a planning phase. */
export async function planningHandles(ctx: EngineCtx, cardId: CardId): Promise<boolean> {
  return ctx.deps.storage.transaction(async (tx) => {
    const card = await tx.cards.get(cardId);
    const type = card ? await tx.cardTypes.get(card.type) : null;

    return (
      card !== null && type !== null && isPlannedType(type) && isPlanningPhase(card.phase)
    );
  });
}

/** Snapshots the effective flow into the card when planning starts; later edits do not reach it. */
async function ensureFlow(pc: PlanCtx): Promise<void> {
  await pc.ctx.deps.storage.transaction(async (tx) => {
    const planning = await tx.cardPlanning.get(pc.card.id);
    if (planning.flow === null && isShaping(pc.card.phase)) {
      await tx.cardPlanning.update(pc.card.id, {
        flow: structuredClone(pc.director.flow),
        flow_config_version: pc.configVersion,
        flow_cursor: 0,
      });
    }
  });
}

/** The text of the owner's message a queued turn answers, or null when it cannot be found. */
async function messageOf(pc: PlanCtx, item: CardReplyQueueItem): Promise<string | null> {
  const events = await pc.ctx.deps.storage.transaction((tx) =>
    tx.cardEvents.list(pc.card.id, {
      limit: 1,
      ...(item.event_id > 0 ? { afterSeq: item.event_id - 1 } : {}),
    }),
  );

  const e = events[0];

  return e && e.seq === item.event_id && e.kind === 'user_message'
    ? e.payload.text
    : null;
}

/**
 * An owner's chat message during planning. An open question takes it as its free-text answer;
 * a ready plan answers with where the owner's actions are; otherwise it is kept as an owner note
 * the next steps read.
 */
async function absorbMessage(pc: PlanCtx, item: CardReplyQueueItem): Promise<void> {
  const text = await messageOf(pc, item);
  if (text === null) {
    return;
  }

  const at = pc.ctx.nowIso;
  await pc.ctx.deps.storage.transaction(async (tx) => {
    const card = await tx.cards.get(pc.card.id);
    const { grill } = await tx.cardPlanning.get(pc.card.id);
    if (card?.phase === 'plan_ready') {
      await logPlanEvent(tx, pc.card.id, at, {
        kind: 'director_message',
        payload: {
          text: 'The plan is ready for you. Approve it, request changes, or edit its tickets.',
        },
      });

      return;
    }

    if (grill.current) {
      await recordAnswerTx(
        tx,
        pc.card.id,
        grill,
        { question_id: grill.current.question_id, text, by: 'owner' },
        at,
      );

      return;
    }

    await tx.cardPlanning.update(pc.card.id, {
      grill: {
        ...grill,
        answers: [
          ...grill.answers,
          { question_id: 'note', question: 'Owner note', answer: text, by: 'owner' },
        ],
      },
    });
  });
}

async function runKind(
  pc: PlanCtx,
  planning: CardPlanningState,
  index: number,
  step: FlowStep,
): Promise<StepOutcome> {
  switch (step.kind) {
    case 'survey':
      return surveyStep(pc, planning, index, step);
    case 'grill':
      return grillStep(pc, planning, index, step);
    case 'verify':
      return verifyStep(pc, planning, index, step);
    case 'enhance':
      return enhanceStep(pc, planning, index, step);
    case 'custom':
      return customStep(pc, planning, index, step);
    case 'write_plan':
      return writePlanStep(pc, planning, index, step);
    case 'approve':
      return approveStep(pc, planning, index, step);
  }
}

/** The approve step runs on a plan that is ready; every other step while the card is still being shaped. */
function canRun(step: FlowStep, phase: CardPhase): boolean {
  return step.kind === 'approve' ? phase === 'plan_ready' : isShaping(phase);
}

/** Walks the flow from the stored cursor until a step needs the owner, fails, or the flow ends. */
async function runFlow(ctx: EngineCtx, cardId: CardId): Promise<FlowEnd> {
  for (let n = 0; n < MAX_STEPS_PER_TURN; n++) {
    const pc = await loadPlanCtx(ctx, cardId);
    if (!pc) {
      return 'done';
    }

    const planning = await ctx.deps.storage.transaction((tx) =>
      tx.cardPlanning.get(cardId),
    );

    const { flow, flow_cursor: cursor, grill } = planning;
    if (flow === null || cursor === null) {
      return 'done';
    }

    if (grill.current) {
      return 'waiting';
    }

    if (grill.queued.length > 0 && isShaping(pc.card.phase)) {
      await askQueued(pc);

      return 'waiting';
    }

    const next = resolveFlowStep(flow, cursor, {
      lane: grill.predicted_lane,
      decisions: grill.step_decisions,
    });

    if (!next) {
      await ctx.deps.storage.transaction((tx) =>
        tx.cardPlanning.update(cardId, { flow_cursor: null }),
      );

      return 'done';
    }

    if (!canRun(next.step, pc.card.phase)) {
      return 'done';
    }

    const outcome = await runKind(pc, planning, next.index, next.step);
    if (outcome === 'wait') {
      return 'waiting';
    }

    if (outcome === 'stop') {
      return 'failed';
    }
  }

  return 'done';
}

/**
 * Runs one planning turn for a card: snapshots the flow on first contact, absorbs the owner's
 * chat messages, then walks the flow. `retry` means a step failed: the caller leaves the queued
 * turns claimed so they are taken again once the claim goes stale.
 */
export async function runPlanningTurn(
  ctx: EngineCtx,
  cardId: CardId,
  items: readonly CardReplyQueueItem[],
): Promise<'done' | 'retry'> {
  const pc = await loadPlanCtx(ctx, cardId);
  if (!pc) {
    return 'done';
  }

  await ensureFlow(pc);
  for (const item of items.filter((i) => i.reason === 'user_message')) {
    await absorbMessage(pc, item);
  }

  const end = await runFlow(ctx, cardId);

  return end === 'failed' ? 'retry' : 'done';
}

/** A note on the card when planning threw outside a model call; the turn stays queued for a retry. */
export async function noteFailure(
  ctx: EngineCtx,
  cardId: CardId,
  reason: string,
): Promise<void> {
  await ctx.deps.storage.transaction((tx) =>
    logCardEvent(tx, cardId, {
      kind: 'note',
      at: ctx.nowIso,
      actor: { type: 'director', id: 'engine' },
      payload: {
        text: `Planning hit a problem (${reason}). The Director will try again shortly.`,
      },
    }),
  );
}
