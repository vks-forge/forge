/**
 * Where an agent is named by a pipeline or a routing rule.
 *
 * Why: a pipeline stage names its agent, and a stage whose agent is switched off or archived can
 *   no longer run; a ticket would stop at it. So an agent that any effective pipeline or routing
 *   rule names cannot be disabled or archived: the owner must first change the pipeline or the
 *   rule (the implementer is no longer special, it is simply named by every built-in lane).
 *   Disabling is per project, so only that project's effective pipelines and rules count;
 *   archiving a company agent affects every project, so the company's pipelines and every
 *   registered project's own lists and rules count. Group members count as stages.
 *
 * Exports: agentPipelineUse().
 * Depends on: @forge/core (flattenStages, LANES), types/agent-store. IO: reads settings and storage.
 */

import { LANES, flattenStages } from '@forge/core';
import type { Lane, PipelineDefinition, ProjectPipelines } from '@forge/core';
import type { AgentDeps, AgentScope, PipelineUse } from '#/types/agent-store.types.js';

const names = (def: PipelineDefinition, agentId: string): boolean =>
  flattenStages(def).some((s) => s.kind === 'agent' && s.agent === agentId);

function addProject(
  out: { lanes: Set<Lane>; rules: Set<string> },
  company: Record<Lane, PipelineDefinition>,
  own: ProjectPipelines | undefined,
  agentId: string,
): void {
  for (const lane of LANES) {
    if (names(own?.[lane] ?? company[lane], agentId)) {
      out.lanes.add(lane);
    }
  }

  for (const r of own?.routing ?? []) {
    if (r.add === agentId) {
      out.rules.add(r.id);
    }
  }
}

/** The pipelines and rules that name `agentId`, seen from `scope` (see the file header for what counts). */
export async function agentPipelineUse(
  deps: AgentDeps,
  scope: AgentScope,
  agentId: string,
): Promise<PipelineUse> {
  const out = { lanes: new Set<Lane>(), rules: new Set<string>() };
  if (scope.scope === 'project') {
    const p = await deps.config.project(scope.slug);
    addProject(out, p.config.forge.pipelines, p.config.project.pipelines, agentId);
  } else {
    const company = (await deps.config.company()).config.pipelines;
    addProject(out, company, undefined, agentId);
    const slugs = await deps.storage.transaction(async (tx) =>
      (await tx.projects.list()).map((p) => p.slug),
    );

    for (const slug of slugs) {
      const p = await deps.config.project(slug);
      addProject(out, company, p.config.project.pipelines, agentId);
    }
  }

  return { lanes: LANES.filter((l) => out.lanes.has(l)), rules: [...out.rules].sort() };
}
