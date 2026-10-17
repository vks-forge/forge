/**
 * Pipeline rules — everything that makes a stage list safe to save and to run.
 *
 * Why: a pipeline is data the owner edits, so nothing about its shape can be trusted until it
 *   is checked, and the checks are the product's safety floor: merge is locked last, G1 judges
 *   the work after the last writer exactly once (no lane skips the independent gate, d-0006),
 *   nobody approves their own work (an agent never checks what it wrote), a reviewer has
 *   something to review, groups hold real checks, and the only way back is a rework edge to an
 *   earlier writer, which is also what rules out loops. Each problem names the stage it
 *   concerns so a screen can show it beside the row. The same function runs when a pipeline
 *   is saved and again when a ticket takes its snapshot, so a roster that changed in between
 *   (an agent archived) can never start a ticket on a list that no longer holds.
 *
 * Exports: pipelineProblems(), routingProblems(), REVIEW_TOOL.
 * Depends on: domain/{pipeline-stage-rules,stage-kinds}, schemas/agent, schemas/pipeline, types/pipeline-rules. No IO.
 */

import {
  REVIEW_TOOL,
  agentProblems,
  canSubmit,
  groupProblems,
  isUsable,
  problem,
  rolesOf,
  scriptProblems,
} from '#/domain/pipeline-stage-rules.js';
import { classifyStage, flattenStages } from '#/domain/stage-kinds.js';
import type { AgentRole } from '#/schemas/agent.js';
import { MAX_STAGES } from '#/schemas/pipeline.js';
import type {
  PipelineDefinition,
  PipelineProblem,
  RoutingRule,
  Stage,
} from '#/schemas/pipeline.js';
import type { PipelineRuleContext, RosterEntry } from '#/types/pipeline-rules.types.js';

export { REVIEW_TOOL };

/** Merge last and once, a writer exists, G1 once and after the writers. */
function frameProblems(
  def: PipelineDefinition,
  roles: Record<string, AgentRole>,
): PipelineProblem[] {
  const out: PipelineProblem[] = [];
  const { stages } = def;
  const merges = stages.filter((s) => s.kind === 'merge');
  if (merges.length === 0) {
    out.push(problem('merge_missing', 'The pipeline has no merge stage'));
  } else if (stages[stages.length - 1]?.kind !== 'merge' || merges.length > 1) {
    out.push(problem('merge_not_last', 'Merge must be the last stage, once', 'merge'));
  }

  const classes = stages.map((s) => classifyStage(s, roles));
  const writers = classes.flatMap((c, i) => (c === 'writer' ? [i] : []));
  const lastWriter = writers.length === 0 ? -1 : (writers[writers.length - 1] as number);
  if (writers.length === 0) {
    out.push(problem('no_writer', 'The pipeline needs at least one writer'));
  }

  const g1s = classes.flatMap((c, i) => (c === 'g1' ? [i] : []));
  if (g1s.length === 0) {
    out.push(problem('g1_missing', 'The G1 gate is required after the last writer'));
  }

  for (const i of g1s.slice(1)) {
    out.push(
      problem('g1_duplicate', 'G1 appears more than once', (stages[i] as Stage).id),
    );
  }

  for (const i of g1s) {
    if (i < lastWriter) {
      out.push(
        problem(
          'g1_before_writer',
          'G1 must come after the last writer',
          (stages[i] as Stage).id,
        ),
      );
    }
  }

  return out;
}

/**
 * Who comes where: a writer needs to come before every gate and check, an agent never checks
 * what it wrote, a reviewer needs a writer before it, one human stage after the checks.
 */
function orderProblems(
  def: PipelineDefinition,
  roles: Record<string, AgentRole>,
): PipelineProblem[] {
  const out: PipelineProblem[] = [];
  const classes = def.stages.map((s) => classifyStage(s, roles));
  const humans = classes.filter((c) => c === 'human').length;
  const writerAgents = new Set<string>();
  let g1Seen = false;
  let checkSeen = false;
  def.stages.forEach((s, i) => {
    const c = classes[i];
    if (c === 'writer' && s.kind === 'agent') {
      if (g1Seen || checkSeen) {
        // The same agent now sits where checks sit: it would be approving its own work.
        if (writerAgents.has(s.agent)) {
          out.push(
            problem(
              'self_review',
              `${s.label}: an agent cannot check its own work`,
              s.id,
            ),
          );
        } else if (checkSeen) {
          out.push(
            problem(
              'writer_after_check',
              `${s.label}: a writer cannot come after a check`,
              s.id,
            ),
          );
        }
      }

      writerAgents.add(s.agent);
    } else if (c === 'g1') {
      g1Seen = true;
    } else if (c === 'check_agent' || c === 'script' || c === 'group') {
      checkSeen = true;
      if (c === 'check_agent' && writerAgents.size === 0) {
        out.push(
          problem(
            'reviewer_first',
            `${s.label}: a reviewer needs a writer before it`,
            s.id,
          ),
        );
      }
    } else if (c === 'human') {
      const checksAfter = classes.some(
        (k, j) =>
          j > i && (k === 'check_agent' || k === 'script' || k === 'group' || k === 'g1'),
      );

      if (humans > 1 || checksAfter) {
        out.push(
          problem(
            'human_position',
            `${s.label}: one human stage, after every check`,
            s.id,
          ),
        );
      }
    }
  });

  return out;
}

/** A check's `rework_to` must name a writer stage that comes before it: the only back edge. */
function reworkProblems(
  def: PipelineDefinition,
  roles: Record<string, AgentRole>,
): PipelineProblem[] {
  const out: PipelineProblem[] = [];
  def.stages.forEach((s, i) => {
    if (s.kind === 'human' || s.kind === 'merge' || s.rework_to === undefined) {
      return;
    }

    const at = def.stages.findIndex((t) => t.id === s.rework_to);
    const target = def.stages[at];
    if (at < 0 || at >= i || !target || classifyStage(target, roles) !== 'writer') {
      out.push(
        problem(
          'rework_target',
          `${s.label}: "send back to" must be a writer stage above it`,
          s.id,
        ),
      );
    }
  });

  return out;
}

function duplicateIdProblems(def: PipelineDefinition): PipelineProblem[] {
  const out: PipelineProblem[] = [];
  const seen = new Set<string>();
  for (const s of flattenStages(def)) {
    if (seen.has(s.id)) {
      out.push(problem('duplicate_stage_id', `Stage id "${s.id}" is used twice`, s.id));
    }

    seen.add(s.id);
  }

  return out;
}

/** Every reason `def` cannot be saved or run under `ctx`. Empty means it holds. */
export function pipelineProblems(
  def: PipelineDefinition,
  ctx: PipelineRuleContext,
): PipelineProblem[] {
  const roles = rolesOf(ctx.roster);
  const entries = new Map(ctx.roster.map((e) => [e.id, e]));
  const out: PipelineProblem[] = [];

  if (def.stages.length > MAX_STAGES) {
    out.push(problem('too_many_stages', `A pipeline holds at most ${MAX_STAGES} stages`));
  }

  for (const s of def.stages) {
    if (s.kind === 'agent') {
      out.push(...agentProblems(s, entries.get(s.agent)));
    } else if (s.kind === 'script_gate') {
      out.push(...scriptProblems(s));
    } else if (s.kind === 'group') {
      out.push(...groupProblems(s, entries));
    }
  }

  out.push(
    ...frameProblems(def, roles),
    ...orderProblems(def, roles),
    ...reworkProblems(def, roles),
    ...duplicateIdProblems(def),
  );

  return out;
}

/** Routing rules only add checks: unique ids, known agents, never a writer. */
export function routingProblems(
  rules: readonly RoutingRule[],
  roster: readonly RosterEntry[],
): PipelineProblem[] {
  const entries = new Map(roster.map((e) => [e.id, e]));
  const out: PipelineProblem[] = [];
  const seen = new Set<string>();
  for (const r of rules) {
    if (seen.has(r.id)) {
      out.push(problem('duplicate_rule_id', `Rule id "${r.id}" is used twice`, r.id));
    }

    seen.add(r.id);
    const entry = entries.get(r.add);
    if (!entry) {
      out.push(
        problem('unknown_agent', `Rule ${r.id}: agent "${r.add}" does not exist`, r.id),
      );

      continue;
    }

    const role = entry.definition.role;
    if (role !== 'reviewer' && role !== 'researcher') {
      out.push(
        problem(
          'routing_writer',
          `Rule ${r.id}: only a reviewer or researcher can be added`,
          r.id,
        ),
      );
    } else if (!isUsable(entry)) {
      out.push(
        problem(
          'agent_unavailable',
          `Rule ${r.id}: agent "${entry.definition.name}" is disabled or archived`,
          r.id,
        ),
      );
    } else if (!canSubmit(entry)) {
      out.push(
        problem(
          'review_tool_missing',
          `Rule ${r.id}: agent "${entry.definition.name}" cannot report a review`,
          r.id,
        ),
      );
    }
  }

  return out;
}
