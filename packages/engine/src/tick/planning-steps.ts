/**
 * Planning steps that look, judge and report: survey, verify, enhance and custom.
 *
 * Why: these four steps share one shape. They read the card, the grill so far and the project's
 *   rules, think, and leave findings for the steps after them. Survey and verify may also ask
 *   the engine to read the code, in at most two rounds (d-0131): the step answers with
 *   `read_requests`, the engine runs them through `admit()` and calls the step again with the
 *   results, so every read is deterministic and recorded. Verify also pins the commit it looked
 *   at, which the approval floor later compares with HEAD. Enhance runs the enhance-decisions
 *   method over the grill (d-0140): its report is stored with the plan, what it resolved becomes
 *   assumptions, and points only the owner can settle are queued as questions. A custom step is
 *   an owner-written instruction run as a Director step; its notes feed the steps that follow.
 *   Entering verify, enhance or the plan moves the card from grilling to verifying.
 *
 * Exports: surveyStep(), verifyStep(), enhanceStep(), customStep().
 * Depends on: @forge/core (step schemas, preCheckLane), tick/planning-input, tick/planning-read-step,
 *   tick/planning-state, tick/planning-step-io, types/card-planning.
 */

import {
  CardSurveyOutput,
  CustomStepOutput,
  EnhanceOutput,
  VerifyOutput,
  maxLane,
  preCheckLane,
} from '@forge/core';
import type {
  CardId,
  CardPlanningState,
  FlowStep,
  Lane,
  SurveyFindings,
  VerifyFindings,
} from '@forge/core';
import { buildStepInput } from '#/tick/planning-input.js';
import { readStep } from '#/tick/planning-read-step.js';
import {
  enterVerifying,
  headOf,
  latestPlanOf,
  logPlanEvent,
  mergeUnique,
  stamp,
} from '#/tick/planning-state.js';
import { callStep, finishStep, startStep } from '#/tick/planning-step-io.js';
import type { PlanCtx, StepOutcome } from '#/types/card-planning.types.js';

/** The lane the survey predicts, raised (never lowered) by the deterministic pre-check over its predicted files. */
function predictedLane(pc: PlanCtx, f: SurveyFindings): Lane | null {
  const files = f.predicted_files;
  if (files.length === 0) {
    return f.predicted_lane ?? null;
  }

  const pre = preCheckLane({
    touchedPaths: files,
    tierCGlobs: pc.tierCGlobs,
    bodyLength: pc.card.summary.length,
    type: 'feat',
  });

  return maxLane(f.predicted_lane ?? 'express', pre.lane);
}

export async function surveyStep(
  pc: PlanCtx,
  planning: CardPlanningState,
  index: number,
  step: FlowStep,
): Promise<StepOutcome> {
  await startStep(pc, step);
  const r = await readStep<SurveyFindings>(
    pc,
    planning,
    step,
    'card_survey',
    CardSurveyOutput,
  );

  if (typeof r === 'string') {
    return r;
  }

  const lane = predictedLane(pc, r.findings);
  await finishStep(pc, step, {
    index,
    files: r.files,
    summary: r.findings.summary,
    cost: r.cost,
    patch: (g) => ({
      ...g,
      survey: r.readNothing ? { ...r.findings, read_nothing: true } : r.findings,
      predicted_lane: lane ?? g.predicted_lane,
      step_decisions: { ...g.step_decisions, ...r.decisions },
    }),
  });

  return 'continue';
}

export async function verifyStep(
  pc: PlanCtx,
  planning: CardPlanningState,
  index: number,
  step: FlowStep,
): Promise<StepOutcome> {
  await enterVerifying(pc);
  await startStep(pc, step);
  const r = await readStep<VerifyFindings>(pc, planning, step, 'verify', VerifyOutput);
  if (typeof r === 'string') {
    return r;
  }

  const head = await headOf(pc);
  await finishStep(pc, step, {
    index,
    files: r.files,
    summary: r.findings.summary,
    cost: r.cost,
    patch: (g) => ({
      ...g,
      verify: r.findings,
      base_sha: head,
      step_decisions: { ...g.step_decisions, ...r.decisions },
    }),
  });

  return 'continue';
}

export async function enhanceStep(
  pc: PlanCtx,
  planning: CardPlanningState,
  index: number,
  step: FlowStep,
): Promise<StepOutcome> {
  await enterVerifying(pc);
  await startStep(pc, step);
  const previous = planning.grill.pending_changes ? await latestPlanOf(pc) : null;
  const input = await buildStepInput(pc, planning.grill, step, previous);
  const call = await callStep(pc, step, 'enhance', EnhanceOutput, input);
  if (!call.ok) {
    return call.outcome;
  }

  const out = call.value;
  const max = pc.director.grill.max_questions_per_round;
  await finishStep(pc, step, {
    index,
    files: [],
    summary: out.summary,
    cost: call.cost,
    patch: (g) => ({
      ...g,
      enhance_report: out.report,
      assumptions: mergeUnique(g.assumptions, out.assumptions),
      queued: [...g.queued, ...out.owner_questions.slice(0, max)],
      step_decisions: { ...g.step_decisions, ...(out.step_decisions ?? {}) },
    }),
    // The clock now, not the tick's start: the model call took minutes, and an older stamp
    // would sort the message before the step it reports and move the card's activity back.
    after: (tx) =>
      logPlanEvent(tx, pc.card.id as CardId, stamp(pc), {
        kind: 'director_message',
        payload: { text: `Enhance pass: ${out.summary}` },
      }),
  });

  return 'continue';
}

export async function customStep(
  pc: PlanCtx,
  planning: CardPlanningState,
  index: number,
  step: FlowStep,
): Promise<StepOutcome> {
  await startStep(pc, step);
  const input = await buildStepInput(pc, planning.grill, step, null);
  const call = await callStep(pc, step, 'custom_step', CustomStepOutput, input);
  if (!call.ok) {
    return call.outcome;
  }

  const out = call.value;
  await finishStep(pc, step, {
    index,
    files: [],
    summary: [out.summary, ...out.notes].join(' '),
    cost: call.cost,
    patch: (g) => ({
      ...g,
      step_decisions: { ...g.step_decisions, ...(out.step_decisions ?? {}) },
    }),
  });

  return 'continue';
}
