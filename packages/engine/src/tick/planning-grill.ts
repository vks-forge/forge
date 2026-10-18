/**
 * Grill: the Director's one-question-at-a-time turns and what the owner may do with them.
 *
 * Why: the grill is where a vague request becomes decisions (d-0130). The Director asks one
 *   question per turn, each with two to four options and one recommended, plus the count of
 *   points still open; the card then waits in Needs you and no model call is spent until the
 *   owner answers, so waiting costs nothing and a restart loses nothing (the open question is
 *   stored). The owner may click an option, write their own answer, take the Director's
 *   recommendations for everything left, or say "enough" and let the open points become plan
 *   assumptions. The Director never answers for the owner. Limits (questions per round, rounds)
 *   turn the remaining points into assumptions instead of an endless interview. All of this is
 *   recorded as card events (`grill_question`, `grill_answer`, `grill_done`) the card page renders.
 *
 * Exports: askQueued(), grillStep(), recordAnswerTx().
 * Depends on: @forge/core (grill schemas), tick/planning-detour, tick/planning-state, tick/planning-step-io, tick/planning-input,
 *   tick/card-budget, tick/card-log, types/card-planning. Writes storage.
 */

import { GrillTurnOutput } from '@forge/core';
import type {
  CardId,
  CardPlanningState,
  FlowStep,
  GrillAnswer,
  GrillDoneReason,
  GrillQuestion,
  GrillQuestionDraft,
  GrillState,
  StorageTx,
} from '@forge/core';
import { warnOnBudget } from '#/tick/card-budget.js';
import { detourTurn } from '#/tick/planning-detour.js';
import { buildStepInput } from '#/tick/planning-input.js';
import {
  askOwner,
  latestPlanOf,
  logPlanEvent,
  mergeUnique,
  setNeedsYou,
  stamp,
} from '#/tick/planning-state.js';
import { callStep, finishStep, startStep } from '#/tick/planning-step-io.js';
import type { OpenExtras, PlanCtx, StepOutcome } from '#/types/card-planning.types.js';

const LIMIT_ASSUMPTION =
  'The question limit was reached, so the remaining open points are treated as assumptions.';

/** The model's draft as the card shows it: the question and its options numbered. */
function toQuestion(draft: GrillQuestionDraft, n: number, open: number): GrillQuestion {
  return {
    question_id: `q${n}`,
    text: draft.text,
    ...(draft.why === undefined ? {} : { why: draft.why }),
    options: draft.options.map((o, i) => ({ id: `o${i + 1}`, ...o })),
    allow_other: true,
    open_points: open,
  };
}

/**
 * Stores `draft` as the open question, logs it and raises the card to Needs you (true), or drops it (false). The state is
 * read again inside the transaction: if the owner ended the grill or answered while the model
 * was thinking, the question is dropped (its cost is still counted) rather than asked after "enough".
 * A question taken from the queue is asked even though the grill step is done (see below).
 */
async function openQuestionTx(
  tx: StorageTx,
  pc: PlanCtx,
  draft: GrillQuestionDraft,
  open: number,
  cost: number,
  extras: OpenExtras = {},
): Promise<boolean> {
  const at = stamp(pc);
  const fresh = (await tx.cardPlanning.get(pc.card.id)).grill;
  const spent = fresh.director_spend_usd + cost;
  // A queued question comes from the enhance pass, which runs after the grill step has finished
  // (`done`), so `done` cannot veto it. The owner's shortcuts empty the queue instead.
  const ended = fresh.done && !extras.fromQueue;
  if (ended || fresh.current !== null) {
    await tx.cardPlanning.update(pc.card.id, {
      grill: { ...fresh, director_spend_usd: spent },
    });

    return false;
  }

  const question = toQuestion(draft, fresh.asked + 1, Math.max(1, open));
  await tx.cardPlanning.update(pc.card.id, {
    grill: {
      ...fresh,
      current: question,
      queued: extras.fromQueue ? fresh.queued.slice(1) : fresh.queued,
      assumptions: mergeUnique(fresh.assumptions, extras.assumptions ?? []),
      step_decisions: { ...fresh.step_decisions, ...(extras.decisions ?? {}) },
      asked: fresh.asked + 1,
      round_asked: fresh.round_asked + 1,
      open_points: question.open_points,
      director_spend_usd: spent,
    },
  });

  await logPlanEvent(tx, pc.card.id, at, { kind: 'grill_question', payload: question });
  await askOwner(tx, pc.card.id, at, 'The Director has a question for you.', ['answer']);
  await warnOnBudget(tx, pc.card.id, at, pc.director.budget_warning_usd);

  return true;
}

/** Asks the next queued question (from the enhance pass) without a model call; the caller then waits. */
export async function askQueued(pc: PlanCtx): Promise<void> {
  await pc.ctx.deps.storage.transaction(async (tx) => {
    const { queued } = (await tx.cardPlanning.get(pc.card.id)).grill;
    const [next] = queued;
    if (next) {
      await openQuestionTx(tx, pc, next, queued.length, 0, { fromQueue: true });
    }
  });
}

/** Ends the grill step: the state says done, `grill_done` is logged unless the owner's shortcut already did. */
async function finishGrill(
  pc: PlanCtx,
  step: FlowStep,
  index: number,
  reason: GrillDoneReason,
  extra: {
    assumptions: string[];
    cost: number;
    logDone: boolean;
    decisions?: Record<string, boolean> | undefined;
  },
): Promise<void> {
  let assumptions: string[] = [];
  await finishStep(pc, step, {
    index,
    files: [],
    summary: `Grill finished (${reason}).`,
    cost: extra.cost,
    patch: (g) => {
      assumptions = mergeUnique(g.assumptions, extra.assumptions);

      return {
        ...g,
        done: true,
        done_reason: g.done_reason ?? reason,
        current: null,
        open_points: null,
        round_open: false,
        assumptions,
        step_decisions: { ...g.step_decisions, ...(extra.decisions ?? {}) },
      };
    },
    after: async (tx) => {
      if (extra.logDone) {
        await logPlanEvent(tx, pc.card.id, stamp(pc), {
          kind: 'grill_done',
          payload: { reason, assumptions },
        });
      }
    },
  });
}

/** One grill pass: finish, or ask the next question and wait for the owner. */
export async function grillStep(
  pc: PlanCtx,
  planning: CardPlanningState,
  index: number,
  step: FlowStep,
): Promise<StepOutcome> {
  let g = planning.grill;
  if (!g.round_open) {
    // Re-read inside the write: an owner shortcut may have landed since the tick loaded the state.
    g = await pc.ctx.deps.storage.transaction(async (tx) => {
      const fresh = (await tx.cardPlanning.get(pc.card.id)).grill;
      const next = {
        ...fresh,
        rounds: fresh.rounds + 1,
        round_open: true,
        round_asked: 0,
      };

      await tx.cardPlanning.update(pc.card.id, { grill: next });

      return next;
    });

    await startStep(pc, step);
  }

  if (g.done) {
    await finishGrill(pc, step, index, g.done_reason ?? 'owner_enough', {
      assumptions: [],
      cost: 0,
      logDone: false,
    });

    return 'continue';
  }

  const { max_questions_per_round: maxQuestions, max_rounds: maxRounds } =
    pc.director.grill;

  if (g.round_asked >= maxQuestions || g.rounds > maxRounds) {
    await finishGrill(pc, step, index, 'nothing_open', {
      assumptions: [LIMIT_ASSUMPTION],
      cost: 0,
      logDone: true,
    });

    return 'continue';
  }

  const previous = g.pending_changes ? await latestPlanOf(pc) : null;
  const input = await buildStepInput(pc, g, step, previous);
  let call = await callStep(pc, step, 'grill_turn', GrillTurnOutput, input);
  if (!call.ok) {
    return call.outcome;
  }

  // The next question rests on an outside fact: look it up first, then take the turn again (d-0144).
  if (call.value.research !== undefined && !call.value.done) {
    const first = call.cost;
    const next = await detourTurn(pc, step, g, previous, call.value.research.questions);
    if (!next.ok) {
      return next.outcome;
    }

    call = { ...next, cost: first + next.cost };
  }

  const out = call.value;
  if (out.done || out.question === undefined) {
    await finishGrill(pc, step, index, out.done_reason ?? 'nothing_open', {
      assumptions: out.assumptions,
      cost: call.cost,
      logDone: true,
      decisions: out.step_decisions,
    });

    return 'continue';
  }

  const asked = out.question;
  const opened = await pc.ctx.deps.storage.transaction((tx) =>
    openQuestionTx(tx, pc, asked, out.open_points, call.cost, {
      assumptions: out.assumptions,
      decisions: out.step_decisions,
    }),
  );

  // Dropped (the owner ended the grill meanwhile): carry on, the stored state says done.
  return opened ? 'wait' : 'continue';
}

/** Stores an answer to the open question: the event, the settled point, the flag cleared. */
export async function recordAnswerTx(
  tx: StorageTx,
  cardId: CardId,
  grill: GrillState,
  answer: GrillAnswer,
  at: string,
  actorId = 'owner',
): Promise<{ seq: number }> {
  const question = grill.current;
  const option = question?.options.find((o) => o.id === answer.option_id);
  const event = (await tx.cardEvents.append(cardId, {
    kind: 'grill_answer',
    at,
    actor: { type: answer.by === 'owner' ? 'user' : 'director', id: actorId },
    payload: answer,
  })) as { seq: number };

  await tx.cardPlanning.update(cardId, {
    grill: {
      ...grill,
      current: null,
      answers: [
        ...grill.answers,
        {
          question_id: answer.question_id,
          question: question?.text ?? '',
          answer: option?.label ?? answer.text ?? '',
          by: answer.by,
        },
      ],
    },
  });

  await tx.cards.update(cardId, { updated_at: at });
  await setNeedsYou(tx, cardId, false, at);

  return event;
}
