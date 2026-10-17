/**
 * Plan steps: write the plan, then approve it or hand it to the owner.
 *
 * Why: these are the two locked steps of the flow (d-0146). Writing the plan turns the grill,
 *   the survey and the verify findings into one versioned, fixed-structure plan (d-0132); the
 *   engine, not the model, fills the decisions (from the stored answers) and the verification
 *   block (from the verify findings and the files it recorded reading), so the plan cannot drift
 *   from what was asked and found, and the approval floor reads facts the model cannot edit. A
 *   revision after Request changes carries a computed diff from the version before.
 *   Approval then runs in the strictest order: the deterministic floor first, and only a plan
 *   that passes (with approval mode "director or user") reaches the tool-less approval step,
 *   which sees the plan, the typed findings and the floor result and nothing else (d-0141 item 6).
 *   Anything else, a floor breach, "always ask", or the Director asking back, stops at Needs you
 *   with Approve and Request changes available, never at a dead end (d-0135).
 *
 * Exports: writePlanStep(), approveStep().
 * Depends on: @forge/core (plan schemas and rules), tick/planning-input, tick/planning-floor,
 *   tick/planning-state, tick/planning-step-io, tick/planning-steps, tick/plan-to-tickets,
 *   tick/card-phase, types/card-planning. Writes storage.
 */

import { ApprovePlanOutput, PlanVersion, WritePlanOutput, diffPlans } from '@forge/core';
import type { CardPlanningState, FlowStep, GrillState } from '@forge/core';
import { moveCardTx } from '#/tick/card-phase.js';
import { approvePlanTx } from '#/tick/plan-to-tickets.js';
import { buildApprovalInput, buildStepInput } from '#/tick/planning-input.js';
import { computeFloor, factsOf } from '#/tick/planning-floor.js';
import {
  askOwner,
  enterVerifying,
  headOf,
  latestPlanOf,
  logPlanEvent,
  mergeUnique,
} from '#/tick/planning-state.js';
import { callStep, finishStep, startStep } from '#/tick/planning-step-io.js';
import type { PlanCtx, StepOutcome } from '#/types/card-planning.types.js';

/** Whether the owner alone approves this card's plan: "always ask", or a card type that never lets the Director approve. */
export function ownerMustApprove(pc: PlanCtx): boolean {
  return pc.director.approval_mode === 'always_ask' || pc.type.plan_approval === 'user';
}

/** The plan version the model's body and the stored state add up to. */
async function composePlan(
  pc: PlanCtx,
  grill: GrillState,
  body: WritePlanOutput,
  previous: PlanVersion | null,
): Promise<PlanVersion> {
  const head = grill.base_sha ?? (await headOf(pc));
  const verify = grill.verify;
  const links = await pc.ctx.deps.storage.transaction(async (tx) => {
    const found = [];
    for (const raw of body.card_links) {
      const linked = await tx.cards.get(raw);
      if (linked && linked.project === pc.card.project && linked.id !== pc.card.id) {
        found.push(linked.id);
      }
    }

    return found;
  });

  const plan = PlanVersion.parse({
    card_id: pc.card.id,
    version: (previous?.version ?? 0) + 1,
    created_at: pc.ctx.nowIso,
    author: 'director',
    config_version: pc.configVersion,
    base_sha: head,
    goal: body.goal,
    scope: body.scope,
    non_goals: body.non_goals,
    decisions: grill.answers.map((a) => ({ question: a.question, answer: a.answer })),
    assumptions: mergeUnique(grill.assumptions, body.assumptions),
    verification: {
      blast_radius: verify?.blast_radius ?? '',
      files_read: grill.files_read.map((f) => f.path),
      overlaps: verify?.overlaps ?? [],
      matching_decisions: verify?.matching_decisions ?? [],
      rejected_hits: verify?.rejected_hits ?? [],
      risks: mergeUnique(
        mergeUnique(verify?.risks ?? [], grill.survey?.risks ?? []),
        body.risks,
      ),
    },
    tickets: body.tickets,
    card_links: links,
    enhance_report: grill.enhance_report,
  });

  return previous ? { ...plan, diff_from_previous: diffPlans(previous, plan) } : plan;
}

export async function writePlanStep(
  pc: PlanCtx,
  planning: CardPlanningState,
  index: number,
  step: FlowStep,
): Promise<StepOutcome> {
  await enterVerifying(pc);
  await startStep(pc, step);
  const previous = await latestPlanOf(pc);
  const input = await buildStepInput(pc, planning.grill, step, previous, {
    grill_decisions: planning.grill.answers,
  });

  const call = await callStep(pc, step, 'write_plan', WritePlanOutput, input);
  if (!call.ok) {
    return 'stop';
  }

  const plan = await composePlan(pc, planning.grill, call.value, previous);
  const floor = await computeFloor(factsOf(pc), plan);
  const eligible = floor.pass && !ownerMustApprove(pc);
  await finishStep(pc, step, {
    index,
    files: [],
    summary: call.value.summary,
    cost: call.cost,
    patch: (g) => ({ ...g, floor, pending_changes: null }),
    after: async (tx) => {
      await tx.cardPlanning.appendPlan(plan);
      await logPlanEvent(tx, pc.card.id, pc.ctx.nowIso, {
        kind: 'plan_ready',
        payload: {
          version: plan.version,
          ticket_count: plan.tickets.length,
          auto_approve_eligible: eligible,
        },
      });

      await moveCardTx(tx, pc.card.id, { type: 'plan_written' }, pc.ctx.nowIso);
    },
  });

  return 'continue';
}

/** What the owner is told when the Director does not approve on its own. */
function whyOwner(pc: PlanCtx, floorReasons: readonly string[]): string {
  if (floorReasons.length > 0) {
    return `The plan needs your approval: ${floorReasons.join('; ')}.`;
  }

  return ownerMustApprove(pc)
    ? 'The plan is ready for your approval.'
    : 'The plan needs your approval.';
}

export async function approveStep(
  pc: PlanCtx,
  planning: CardPlanningState,
  index: number,
  step: FlowStep,
): Promise<StepOutcome> {
  const plan = await latestPlanOf(pc);
  if (!plan) {
    return 'stop';
  }

  await startStep(pc, step);
  const floor = await computeFloor(factsOf(pc), plan);
  const toOwner = (reason: string, cost: number, summary: string) =>
    finishStep(pc, step, {
      index,
      files: [],
      summary,
      cost,
      patch: (g) => ({ ...g, floor }),
      after: (tx) =>
        askOwner(tx, pc.card.id, pc.ctx.nowIso, reason, [
          'approve_plan',
          'request_changes',
        ]),
    });

  if (!floor.pass || ownerMustApprove(pc)) {
    await toOwner(whyOwner(pc, floor.reasons), 0, 'Waiting for the owner to approve.');

    return 'wait';
  }

  const input = buildApprovalInput(pc, planning.grill, step, plan, floor);
  const call = await callStep(pc, step, 'approve_plan', ApprovePlanOutput, input);
  if (!call.ok) {
    return 'stop';
  }

  if (call.value.decision === 'ask_owner') {
    const asks = call.value.questions.join(' ');
    await toOwner(
      `The Director has questions before approving: ${asks}`,
      call.cost,
      'Asked the owner.',
    );

    return 'wait';
  }

  let approved = false;
  await finishStep(pc, step, {
    index,
    files: [],
    summary: 'Approved.',
    cost: call.cost,
    patch: (g) => ({ ...g, floor }),
    after: async (tx) => {
      const out = await approvePlanTx(
        tx,
        pc.ctx.deps,
        pc.card.id,
        plan.version,
        'director',
        pc.ctx.nowIso,
        pc.tierCGlobs,
        'engine',
      );

      approved = out.status === 'approved';
    },
  });

  return approved ? 'continue' : 'wait';
}
