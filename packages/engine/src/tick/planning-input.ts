/**
 * Planning step input: everything a Director planning step is shown, and nothing else.
 *
 * Why: the Director's method comes from text injected into the step, not from the harness
 *   (d-0130): the playbook of the step, the step's own instructions, the owner's house rules,
 *   the project's rules (active decisions, rejected approaches, and the repo's `CLAUDE.md` or
 *   `AGENTS.md` read at HEAD), the card, the grill as structured state (open points, answers,
 *   assumptions, never the raw chat, so a long card cannot blow the context), the findings of
 *   earlier steps and, after Request changes, the comment with the plan it concerns. All of
 *   it rides inside the JSON input the driver fences as data. The approval step is the
 *   exception by design (d-0141 item 6): it sees only the plan, the typed findings and the
 *   floor result, so text from the repository or the chat cannot talk it into approving.
 *
 * Exports: REPO_RULE_FILES, readRepoRules(), buildStepInput(), buildApprovalInput().
 * Depends on: tick/memory-context (the memory shown to the Director), @forge/core (grill and plan types), tick/plan-keys, tick/planning-state, types/card-planning.
 *   Reads the memory and repo ports and the card's tickets.
 */

import type { FloorResult, GrillState, PlanVersion } from '@forge/core';
import type { FlowStep } from '@forge/core';
import { buildMemoryContext } from '#/tick/memory-context.js';
import { ticketPlanKeys } from '#/tick/plan-keys.js';
import { evidenceInput, loadEvidenceViews } from '#/tick/research-store.js';
import type { PlanCtx } from '#/types/card-planning.types.js';
import type { EngineCtx } from '#/types/engine-state.types.js';

/** Repo files that hold the project's own rules for agents, read at HEAD and capped. */
export const REPO_RULE_FILES = ['CLAUDE.md', 'AGENTS.md'] as const;

const RULES_CAP_BYTES = 12_000;

/** The project's own rule files read at HEAD (those the repository tracks), for any Director step that must respect them. */
export async function readRepoRules(
  ctx: EngineCtx,
  root: string | null,
): Promise<{ path: string; content: string }[]> {
  if (root === null) {
    return [];
  }

  const out: { path: string; content: string }[] = [];
  for (const path of REPO_RULE_FILES) {
    try {
      const file = await ctx.deps.repoReader.readAtHead(root, path, RULES_CAP_BYTES);

      out.push({ path, content: file.content });
    } catch {
      // Not tracked at HEAD (or no repository): the project simply has no such file.
    }
  }

  return out;
}

/** The card's tickets so far with their status and the plan key they came from; empty before the first approval. */
async function existingTickets(pc: PlanCtx): Promise<Record<string, unknown>[]> {
  return pc.ctx.deps.storage.transaction(async (tx) => {
    const keys = await ticketPlanKeys(tx, pc.card.id);

    return (await tx.tickets.listByCard(pc.card.id)).map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      plan_key: keys.get(t.id)?.key ?? null,
      plan_version: keys.get(t.id)?.version ?? null,
    }));
  });
}

/** The playbook of `step` as the step input carries it, or null when it names none that exists. */
export function playbookOf(pc: PlanCtx, step: FlowStep): Record<string, unknown> | null {
  const id = step.playbook_id;
  const body = id === undefined ? undefined : pc.director.playbooks[id];

  return id === undefined || body === undefined
    ? null
    : { id, title: body.title, body: body.body };
}

/** The step as its input names it. */
export const stepOf = (step: FlowStep): Record<string, unknown> => ({
  id: step.id,
  kind: step.kind,
  label: step.label,
  depth: step.depth ?? 'normal',
  instructions: step.instructions ?? '',
});

/** The card block of a step input. */
export const cardInput = (pc: PlanCtx): Record<string, unknown> => ({
  id: pc.card.id,
  title: pc.card.title,
  summary: pc.card.summary,
  type: pc.card.type,
  priority: pc.card.priority,
  links: pc.card.links,
  phase: pc.card.phase,
});

/** The input of a planning step; `extra` adds the step-specific fields (read results, the previous plan). */
export async function buildStepInput(
  pc: PlanCtx,
  grill: GrillState,
  step: FlowStep,
  previousPlan: PlanVersion | null,
  extra: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const memory = await buildMemoryContext(pc.ctx, pc.project.slug, {
    question: [pc.card.title, pc.card.summary, grill.current?.text ?? ''].join('\n'),
    rewrite: true,
    cardId: pc.card.id,
  });

  const existing = await existingTickets(pc);
  const evidence = await pc.ctx.deps.storage.transaction((tx) =>
    loadEvidenceViews(tx, pc.card.id),
  );

  return {
    step: stepOf(step),
    playbook: playbookOf(pc, step),
    house_rules: pc.director.house_rules,
    project_rules: {
      decisions: memory.decisions,
      rejected: memory.rejected,
      ...(memory.note === undefined ? {} : { note: memory.note }),
      repo_rules: await readRepoRules(pc.ctx, pc.root),
    },
    card: cardInput(pc),
    grill: {
      answers: grill.answers.map((a) => ({
        question: a.question,
        answer: a.answer,
        by: a.by,
      })),
      assumptions: grill.assumptions,
      open_points: grill.open_points,
      asked: grill.asked,
      round_asked: grill.round_asked,
      max_questions: pc.director.grill.max_questions_per_round,
      current_question: grill.current,
    },
    survey: grill.survey,
    verify: grill.verify,
    // What research found, as the engine checked it: claims, verified quotes, refs, statuses and where they came from (d-0144).
    evidence: evidenceInput(evidence),
    enhance_report: grill.enhance_report,
    previous_steps: grill.step_summaries,
    lane_hint: grill.predicted_lane,
    changes_requested:
      grill.pending_changes === null
        ? null
        : { ...grill.pending_changes, previous_plan: previousPlan },
    // After a re-plan the card already has tickets: done and running ones stay and must not be planned twice.
    ...(existing.length === 0 ? {} : { existing_tickets: existing }),
    ...extra,
  };
}

/**
 * The plan as the approval step sees it: the evidence is cut down to claim, ref and status, so no quote and
 * no page text can reach the one step that decides (d-0141 item 6, d-0144).
 */
function withoutQuotes(plan: PlanVersion): Record<string, unknown> {
  return {
    ...plan,
    verification: {
      ...plan.verification,
      evidence: plan.verification.evidence.map((e) => ({
        ref: e.ref,
        claim: e.claim,
        status: e.status,
      })),
    },
  };
}

/** The input of the approval step: the plan, the typed findings and the floor result, and nothing from the repository or the chat. */
export function buildApprovalInput(
  pc: PlanCtx,
  grill: GrillState,
  step: FlowStep,
  plan: PlanVersion,
  floor: FloorResult,
): Record<string, unknown> {
  return {
    step: stepOf(step),
    playbook: playbookOf(pc, step),
    house_rules: pc.director.house_rules,
    plan: withoutQuotes(plan),
    findings: grill.verify,
    floor,
  };
}
