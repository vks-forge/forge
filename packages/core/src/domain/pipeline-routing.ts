/**
 * Pipeline routing — project rules that add a check when the work touches certain paths.
 *
 * Why: some changes deserve a second pair of eyes whatever the lane: a Terraform file wants a
 *   network reviewer, a migration a database one (d-0069). A rule says "when these paths are
 *   touched, add this agent". Rules only ever make a pipeline stricter: a matching rule appends
 *   one check right before the human or merge stage, and nothing is ever removed or reordered.
 *   They are evaluated twice, on the plan's files when the ticket takes its snapshot and again
 *   on the real diff when verifying starts, so a change that grew into a sensitive path is
 *   caught. A rule that names a writer, or an agent the ticket does not know as a check, is
 *   skipped rather than obeyed (fail closed). A rule fires at most once per ticket.
 *
 * Exports: routeStages(), routedStageId().
 * Depends on: shared/glob, domain/stage-kinds, schemas/agent, schemas/pipeline. No IO.
 */

import { classifyStage, flattenStages } from '#/domain/stage-kinds.js';
import type { AgentId, AgentRole } from '#/schemas/agent.js';
import { MAX_STAGES } from '#/schemas/pipeline.js';
import type { PipelineDefinition, RoutingRule, Stage } from '#/schemas/pipeline.js';
import { globMatch } from '#/shared/glob.js';

/** The stage id a rule's check gets in a ticket's pipeline. */
export const routedStageId = (ruleId: string): string => `route-${ruleId}`.slice(0, 40);

/**
 * `def` with one check appended per rule that matches `paths`, and the rules that fired.
 * `roles` (when given) is the role of each agent: a rule whose agent is not a reviewer or
 * researcher is skipped. A rule already present in `def` (by stage id) is not added again.
 */
export function routeStages(
  def: PipelineDefinition,
  rules: readonly RoutingRule[],
  paths: readonly string[],
  roles?: Readonly<Record<AgentId, AgentRole>>,
): {
  definition: PipelineDefinition;
  fired: { rule_id: string; agent: string; stage_id: string }[];
} {
  const present = new Set(flattenStages(def).map((s) => s.id));
  const added: Stage[] = [];
  const fired: { rule_id: string; agent: string; stage_id: string }[] = [];
  for (const rule of rules) {
    const stageId = routedStageId(rule.id);
    if (
      present.has(stageId) ||
      def.stages.length + added.length >= MAX_STAGES ||
      !rule.paths.some((g) => paths.some((p) => globMatch(g, p, true)))
    ) {
      continue;
    }

    const stage: Stage = {
      id: stageId,
      kind: 'agent',
      label: rule.label?.trim() ? rule.label.trim() : `Check: ${rule.id}`,
      agent: rule.add,
    };

    if (roles !== undefined && classifyStage(stage, roles) !== 'check_agent') {
      continue;
    }

    present.add(stageId);
    added.push(stage);
    fired.push({ rule_id: rule.id, agent: rule.add, stage_id: stageId });
  }

  if (added.length === 0) {
    return { definition: def, fired };
  }

  // Before the human stage when there is one, else before merge: the last two kinds close the list.
  const at = def.stages.findIndex((s) => s.kind === 'human' || s.kind === 'merge');
  const stages = [...def.stages];
  stages.splice(at < 0 ? stages.length : at, 0, ...added);

  return { definition: { ...def, stages }, fired };
}
