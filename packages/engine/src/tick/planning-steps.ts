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
 * Depends on: @forge/core (step schemas, preCheckLane), tick/planning-input, tick/planning-reads,
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
  StepName,
  SurveyFindings,
  VerifyFindings,
} from '@forge/core';
import type { ZodType } from 'zod';
import { buildStepInput } from '#/tick/planning-input.js';
import { MAX_READ_ROUNDS, runReads } from '#/tick/planning-reads.js';
import {
  enterVerifying,
  headOf,
  latestPlanOf,
  logPlanEvent,
  mergeUnique,
} from '#/tick/planning-state.js';
import { callStep, finishStep, startStep } from '#/tick/planning-step-io.js';
import type {
  PlanCtx,
  ReadBudget,
  ReadOutput,
  ReadResult,
  ReadStepResult,
  StepOutcome,
} from '#/types/card-planning.types.js';

/** The read-round loop of survey and verify; null when the step failed (already reported on the card). */
async function readStep<F>(
  pc: PlanCtx,
  planning: CardPlanningState,
  step: FlowStep,
  name: Extract<StepName, 'card_survey' | 'verify'>,
  schema: ZodType<ReadOutput<F>>,
): Promise<ReadStepResult<F> | null> {
  const caps = pc.director.read_caps;
  const budget: ReadBudget = {
    filesLeft: caps.max_files,
    bytesLeft: caps.max_bytes,
    filesRead: [],
  };

  const previous = planning.grill.pending_changes ? await latestPlanOf(pc) : null;
  const results: ReadResult[] = [];
  let cost = 0;
  for (let round = 0; round <= MAX_READ_ROUNDS; round++) {
    const input = await buildStepInput(pc, planning.grill, step, previous, {
      read_results: results,
      read_round: round,
      reads_remaining: MAX_READ_ROUNDS - round,
      read_caps: { files_left: budget.filesLeft, bytes_left: budget.bytesLeft },
    });

    const call = await callStep(pc, step, name, schema, input);
    cost += call.cost;
    if (!call.ok) {
      return null;
    }

    const out = call.value;
    if (out.findings !== undefined) {
      return {
        findings: out.findings,
        files: budget.filesRead,
        cost,
        decisions: out.step_decisions ?? {},
      };
    }

    if (round === MAX_READ_ROUNDS) {
      break;
    }

    results.push(...(await runReads(pc, out.read_requests ?? [], budget)));
  }

  await failedWithReads(pc, step, name);

  return null;
}

/** The step kept asking for reads after its last round: the answer is unusable, reported like any rejected step. */
async function failedWithReads(
  pc: PlanCtx,
  step: FlowStep,
  name: StepName,
): Promise<void> {
  const message = 'it still asked for reads after the last read round';
  pc.ctx.report.rejectedSteps.push({
    step: name,
    ticketId: pc.card.id,
    reason: `invalid_output: ${message}`,
  });

  await pc.ctx.deps.storage.transaction((tx) =>
    logPlanEvent(tx, pc.card.id, pc.ctx.nowIso, {
      kind: 'note',
      payload: {
        text: `The Director could not finish "${step.label}" (${message}). It will try again shortly.`,
      },
    }),
  );
}

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

  if (!r) {
    return 'stop';
  }

  const lane = predictedLane(pc, r.findings);
  await finishStep(pc, step, {
    index,
    files: r.files,
    summary: r.findings.summary,
    cost: r.cost,
    patch: (g) => ({
      ...g,
      survey: r.findings,
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
  if (!r) {
    return 'stop';
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
    return 'stop';
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
    }),
    after: (tx) =>
      logPlanEvent(tx, pc.card.id as CardId, pc.ctx.nowIso, {
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
    return 'stop';
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
