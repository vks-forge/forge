/**
 * Effective agents — the roster one scope sees, and the agent a lane runs.
 *
 * Why: the company keeps one set of agents, and a project may override an agent's instructions
 *   and where it runs, switch an agent off, or add agents of its own (d-0149). Screens and the
 *   engine must agree on what that adds up to, so the merge is one pure function: it lays each
 *   project override over the company definition, tags every agent with why it is listed the
 *   way it is (built in, edited, overridden here, disabled, archived), hashes the effective
 *   definition so a run can name exactly what it used, and attaches whether the harness it
 *   names can start a run today. Disabled and archived agents stay listed so they can be
 *   restored; the lane never picks them. Until lane pipelines exist every lane runs the
 *   implementer, and it always resolves, because a lane with no writer could not run at all.
 *
 * Exports: effectiveAgents(), laneAgent(), isRunnable().
 * Depends on: domain/agent-rules (agentHash), domain/builtin-agents, schemas/agent,
 *   schemas/agent-api, types/effective-agents. No IO.
 */

import { agentHash } from '#/domain/agent-rules.js';
import {
  BUILTIN_AGENTS,
  BUILTIN_AGENT_IDS,
  IMPLEMENTER_ID,
} from '#/domain/builtin-agents.js';
import type { AgentDefinition, ProjectAgents } from '#/schemas/agent.js';
import type { AgentTag, AgentView } from '#/schemas/agent-api.js';
import type { ReadinessLookup } from '#/types/effective-agents.types.js';

const byName = (a: AgentView, b: AgentView): number =>
  a.definition.name.localeCompare(b.definition.name) || a.id.localeCompare(b.id);

/** True when the owner changed a built-in agent away from what the release ships. */
function editedBuiltin(id: string, def: AgentDefinition): boolean {
  const shipped = BUILTIN_AGENTS[id];

  return shipped !== undefined && agentHash(shipped) !== agentHash(def);
}

function view(
  id: string,
  scope: AgentView['scope'],
  definition: AgentDefinition,
  tags: AgentTag[],
  readiness: ReadinessLookup,
  base?: AgentDefinition,
): AgentView {
  return {
    id,
    scope,
    tags: definition.archived ? [...tags, 'archived'] : tags,
    definition,
    ...(base ? { base } : {}),
    hash: agentHash(definition),
    readiness: readiness(definition.runs_on),
  };
}

/**
 * Every agent `project` sees, or the company roster when `project` is undefined. Order: built-in
 * agents in their shipped order, then the company's own by name, then the project's by name.
 */
export function effectiveAgents(
  company: Readonly<Record<string, AgentDefinition>>,
  project: ProjectAgents | undefined,
  readiness: ReadinessLookup,
): AgentView[] {
  const disabled = new Set(project?.disabled ?? []);
  const shipped = BUILTIN_AGENT_IDS.filter((id) => company[id] !== undefined);
  const others = Object.keys(company).filter((id) => !BUILTIN_AGENT_IDS.includes(id));
  const out: AgentView[] = [];

  for (const id of [...shipped, ...others.sort()]) {
    const base = company[id] as AgentDefinition;
    const builtin = base.origin === 'builtin';
    const over = project?.overrides[id];
    const tags: AgentTag[] = [builtin ? 'builtin' : 'company'];

    if (project === undefined) {
      if (builtin && editedBuiltin(id, base)) {
        tags.push('overridden');
      }

      out.push(view(id, 'company', base, tags, readiness));
      continue;
    }

    const effective: AgentDefinition = {
      ...base,
      ...(over?.instructions === undefined ? {} : { instructions: over.instructions }),
      ...(over?.runs_on === undefined ? {} : { runs_on: over.runs_on }),
    };

    if (over !== undefined) {
      tags.push('overridden');
    }

    if (disabled.has(id)) {
      tags.push('disabled');
    }

    out.push(view(id, 'company', effective, tags, readiness, over ? base : undefined));
  }

  const own = Object.entries(project?.custom ?? {})
    .map(([id, def]) => view(id, 'project', def, ['project'], readiness))
    .sort(byName);

  const company_ = out.filter((v) => !BUILTIN_AGENT_IDS.includes(v.id)).sort(byName);
  const builtins = out.filter((v) => BUILTIN_AGENT_IDS.includes(v.id));

  return [...builtins, ...company_, ...own];
}

/** True when the agent may be picked for a run: neither disabled in this scope nor archived. */
export function isRunnable(v: AgentView): boolean {
  return !v.tags.includes('disabled') && !v.tags.includes('archived');
}

/**
 * The agent a lane runs. Until lane pipelines exist (S5b) every lane runs the implementer.
 * It always resolves: when the stored implementer is unusable the shipped one answers, so a
 * ticket is never left without a writer.
 */
export function laneAgent(views: readonly AgentView[], lane: string): AgentView {
  // Every lane runs the implementer until pipelines can name a writer per lane (S5b).
  void lane;
  const found = views.find((v) => v.id === IMPLEMENTER_ID && isRunnable(v));
  if (found) {
    return found;
  }

  const shipped = BUILTIN_AGENTS[IMPLEMENTER_ID] as AgentDefinition;

  return {
    id: IMPLEMENTER_ID,
    scope: 'company',
    tags: ['builtin'],
    definition: shipped,
    hash: agentHash(shipped),
    readiness: { ready: true, reasons: [] },
  };
}
