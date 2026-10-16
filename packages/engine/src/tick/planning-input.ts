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
 * Exports: REPO_RULE_FILES, buildStepInput(), buildApprovalInput().
 * Depends on: @forge/core (grill and plan types), tick/planning-state, types/card-planning. Reads the
 *   memory and repo ports.
 */

import type { FloorResult, GrillState, PlanVersion } from '@forge/core';
import type { FlowStep } from '@forge/core';
import type { PlanCtx } from '#/types/card-planning.types.js';

/** Repo files that hold the project's own rules for agents, read at HEAD and capped. */
export const REPO_RULE_FILES = ['CLAUDE.md', 'AGENTS.md'] as const;

const RULES_CAP_BYTES = 12_000;

async function repoRules(pc: PlanCtx): Promise<{ path: string; content: string }[]> {
  if (pc.root === null) {
    return [];
  }

  const out: { path: string; content: string }[] = [];
  for (const path of REPO_RULE_FILES) {
    try {
      const file = await pc.ctx.deps.repoReader.readAtHead(
        pc.root,
        path,
        RULES_CAP_BYTES,
      );

      out.push({ path, content: file.content });
    } catch {
      // Not tracked at HEAD (or no repository): the project simply has no such file.
    }
  }

  return out;
}

function playbookOf(pc: PlanCtx, step: FlowStep): Record<string, unknown> | null {
  const id = step.playbook_id;
  const body = id === undefined ? undefined : pc.director.playbooks[id];

  return id === undefined || body === undefined
    ? null
    : { id, title: body.title, body: body.body };
}

const stepOf = (step: FlowStep): Record<string, unknown> => ({
  id: step.id,
  kind: step.kind,
  label: step.label,
  depth: step.depth ?? 'normal',
  instructions: step.instructions ?? '',
});

/** The input of a planning step; `extra` adds the step-specific fields (read results, the previous plan). */
export async function buildStepInput(
  pc: PlanCtx,
  grill: GrillState,
  step: FlowStep,
  previousPlan: PlanVersion | null,
  extra: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const memory = await pc.ctx.deps.memory.slice(pc.project.slug);
  const { card } = pc;

  return {
    step: stepOf(step),
    playbook: playbookOf(pc, step),
    house_rules: pc.director.house_rules,
    project_rules: {
      decisions: memory.decisions,
      rejected: memory.rejected,
      repo_rules: await repoRules(pc),
    },
    card: {
      id: card.id,
      title: card.title,
      summary: card.summary,
      type: card.type,
      priority: card.priority,
      links: card.links,
      phase: card.phase,
    },
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
    enhance_report: grill.enhance_report,
    previous_steps: grill.step_summaries,
    lane_hint: grill.predicted_lane,
    changes_requested:
      grill.pending_changes === null
        ? null
        : { ...grill.pending_changes, previous_plan: previousPlan },
    ...extra,
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
    plan,
    findings: grill.verify,
    floor,
  };
}
