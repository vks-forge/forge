/**
 * Plan steps: write the plan, then approve it or hand it to the owner.
 *
 * Why: these are the two locked steps of the flow (d-0146). Writing the plan turns the grill,
 *   the survey and the verify findings into one versioned, fixed-structure plan (d-0132); the
 *   engine, not the model, fills the decisions (from the stored answers) and the verification
 *   block (from the verify findings and the files it recorded reading), so the plan cannot drift
 *   from what was asked and found, and the approval floor reads facts the model cannot edit. The same goes for the
 *   evidence the plan rests on: the engine attaches the card's checked research and marks each outside claim. The planner may also
 *   tailor a ticket's pipeline; each op is checked against the lane here and only the ops that hold are kept, the
 *   others named under the risks. A revision after Request changes carries a computed diff from the version before.
 *   The planner must account for every owner answer (`decision_checks`; a missing index is retried once);
 *   an answer it contradicts, by its own word or a negating non-goal, is stored on the plan and fails the floor.
 *   Risks and assumptions merge without near-duplicates (`dedupeStatements`). Approval then runs in the strictest order: the deterministic floor first, and only a plan
 *   that passes (with approval mode "director or user") reaches the tool-less approval step,
 *   which sees the plan, the typed findings and the floor result and nothing else (d-0141 item 6).
 *   Anything else, a floor breach, "always ask", or the Director asking back, stops at Needs you
 *   with Approve and Request changes available, never at a dead end (d-0135).
 *
 * Exports: writePlanStep(), approveStep().
 * Depends on: tick/planning-rejected (the rejected approaches a plan repeats), @forge/core (plan schemas and rules), tick/planning-input, tick/planning-floor, tick/planning-pipelines,
 *   tick/planning-state, tick/planning-step-io, tick/planning-steps, tick/plan-to-tickets,
 *   tick/card-phase, types/card-planning. Writes storage.
 */

import {
  ApprovePlanOutput,
  PlanVersion,
  dedupeStatements,
  diffPlans,
  findDecisionConflicts,
  markOutsideClaims,
  writePlanOutputFor,
} from '@forge/core';
import type { WritePlanOutput } from '@forge/core';
import type { CardPlanningState, FlowStep, GrillState, Ticket } from '@forge/core';
import { moveCardTx } from '#/tick/card-phase.js';
import { stopCancelledAll } from '#/tick/ticket-cancel.js';
import { approvePlanTx } from '#/tick/plan-to-tickets.js';
import { buildApprovalInput, buildStepInput } from '#/tick/planning-input.js';
import { computeFloor, factsOf } from '#/tick/planning-floor.js';
import { pipelinesInput, vetPipelineOps } from '#/tick/planning-pipelines.js';
import { planRejectedHits } from '#/tick/planning-rejected.js';
import {
  askOwner,
  enterVerifying,
  headOf,
  latestPlanOf,
  knownRisks,
  logPlanEvent,
  mergeUnique,
  stamp,
} from '#/tick/planning-state.js';
import { callStep, finishStep, startStep } from '#/tick/planning-step-io.js';
import { loadEvidenceViews } from '#/tick/research-store.js';
import type { OwnerAsk, PlanCtx, StepOutcome } from '#/types/card-planning.types.js';

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

  // The planner's pipeline ops are untrusted: only those that hold on their lane stay, the rest are named under the risks.
  const vetted = vetPipelineOps(pc, body.tickets, stamp(pc));

  // The evidence is the engine's: every checked claim of the card with its sources, and each outside claim the plan
  // names is marked supported or unverified here, never by the model that wrote the plan (d-0144).
  const evidence = await pc.ctx.deps.storage.transaction((tx) =>
    loadEvidenceViews(tx, pc.card.id),
  );

  const decisions = grill.answers.map((a) => ({
    question: a.question,
    answer: a.answer,
  }));

  const plan = PlanVersion.parse({
    card_id: pc.card.id,
    version: (previous?.version ?? 0) + 1,
    created_at: stamp(pc),
    author: 'director',
    config_version: pc.configVersion,
    base_sha: head,
    goal: body.goal,
    scope: body.scope,
    non_goals: body.non_goals,
    decisions,
    decision_conflicts: findDecisionConflicts(
      decisions,
      body.decision_checks,
      body.non_goals,
    ),
    assumptions: dedupeStatements([...grill.assumptions, ...body.assumptions]),
    verification: {
      blast_radius: verify?.blast_radius ?? '',
      files_read: grill.files_read.map((f) => f.path),
      overlaps: verify?.overlaps ?? [],
      matching_decisions: verify?.matching_decisions ?? [],
      rejected_hits: mergeUnique(
        verify?.rejected_hits ?? [],
        await planRejectedHits(pc, body),
      ),
      // The engine's own notes name distinct stages in near-identical words, so only the written risks are deduped.
      risks: mergeUnique(
        dedupeStatements([...knownRisks(grill), ...body.risks]),
        vetted.notes,
      ),
      evidence,
      outside_claims: markOutsideClaims(body.outside_claims, evidence),
    },
    tickets: vetted.tickets,
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
    known_risks: knownRisks(planning.grill),
    pipelines: await pipelinesInput(pc),
  });

  const call = await callStep(
    pc,
    step,
    'write_plan',
    writePlanOutputFor(planning.grill.answers.length),
    input,
  );

  if (!call.ok) {
    return call.outcome;
  }

  const plan = await composePlan(pc, planning.grill, call.value, previous);
  const floor = await computeFloor(factsOf(pc), plan);
  const eligible = floor.pass && !ownerMustApprove(pc);
  await finishStep(pc, step, {
    index,
    files: [],
    summary: call.value.summary,
    cost: call.cost,
    patch: (g) => ({ ...g, floor, pending_changes: null, replan_from: null }),
    after: async (tx) => {
      await tx.cardPlanning.appendPlan(plan);
      await logPlanEvent(tx, pc.card.id, stamp(pc), {
        kind: 'plan_ready',
        payload: {
          version: plan.version,
          ticket_count: plan.tickets.length,
          auto_approve_eligible: eligible,
        },
      });

      await moveCardTx(tx, pc.card.id, { type: 'plan_written' }, stamp(pc));
    },
  });

  return 'continue';
}

/**
 * What the owner is told when the Director does not approve on its own: the one-line reason
 * older readers show, and each floor reason as its own item for the dock.
 */
function whyOwner(pc: PlanCtx, floorReasons: readonly string[]): OwnerAsk {
  const base = {
    kind: 'plan_approval',
    actions: ['approve_plan', 'request_changes'],
  } as const;

  if (floorReasons.length > 0) {
    return {
      ...base,
      reason: `The plan needs your approval: ${floorReasons.join('; ')}.`,
      title: 'The plan needs your approval',
      items: floorReasons,
    };
  }

  const reason = ownerMustApprove(pc)
    ? 'The plan is ready for your approval.'
    : 'The plan needs your approval.';

  return { ...base, reason, title: reason.replace(/\.$/, ''), items: [reason] };
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
  const toOwner = (ask: OwnerAsk, cost: number, summary: string) =>
    finishStep(pc, step, {
      index,
      files: [],
      summary,
      cost,
      patch: (g) => ({ ...g, floor }),
      after: (tx) => askOwner(tx, pc.card.id, stamp(pc), ask),
    });

  if (!floor.pass || ownerMustApprove(pc)) {
    await toOwner(whyOwner(pc, floor.reasons), 0, 'Waiting for the owner to approve.');

    return 'wait';
  }

  const input = buildApprovalInput(pc, planning.grill, step, plan, floor);
  const call = await callStep(pc, step, 'approve_plan', ApprovePlanOutput, input);
  if (!call.ok) {
    return call.outcome;
  }

  if (call.value.decision === 'ask_owner') {
    const questions = call.value.questions;
    await toOwner(
      {
        reason: `The Director has questions before approving: ${questions.join(' ')}`,
        kind: 'director_questions',
        title: 'The Director has questions before approving',
        items: questions,
        actions: ['approve_plan', 'request_changes'],
      },
      call.cost,
      'Asked the owner.',
    );

    return 'wait';
  }

  let approved = false;
  let cancelled: readonly Ticket[] | undefined;
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
        stamp(pc),
        pc.tierCGlobs,
        'engine',
      );

      approved = out.status === 'approved';
      cancelled = out.status === 'approved' ? out.cancelled : undefined;
    },
  });

  await stopCancelledAll(pc.ctx.deps, pc.ctx.state, cancelled);

  return approved ? 'continue' : 'wait';
}
