/**
 * Agent edits on a stored override document — pure helpers the agent store applies.
 *
 * Why: agents live inside the company and project override documents, and every save writes
 *   the whole next document as one version. How an edit lands in that document is a rule,
 *   not a detail: a built-in agent is stored as only the fields that differ from what the
 *   release ships (so a better shipped instruction still reaches everyone who did not edit
 *   it, and Reset is removing the key); a custom agent is stored whole; a project override
 *   keeps only `instructions` and `runs_on` and only where they differ from the company
 *   agent. Keeping these as pure functions from document to document means the store only
 *   reads, calls one, validates and appends, and tests can pin each rule without a database.
 *
 * Exports: slugifyAgentName(), addCompanyAgent(), storeCompanyAgent(), resetCompanyAgent(),
 *   addProjectAgent(), storeProjectAgent(), storeProjectOverride(), resetProjectOverride(),
 *   setProjectDisabled(), diffAgent().
 * Depends on: domain/builtin-agents, schemas/agent, schemas/config-override, shared/stable-json,
 *   types/agent-doc. No IO.
 */

import { BUILTIN_AGENTS } from '#/domain/builtin-agents.js';
import type { AgentDefinition, AgentInput } from '#/schemas/agent.js';
import type { CompanyOverride, ProjectOverride } from '#/schemas/config-override.js';
import { stableJson } from '#/shared/stable-json.js';
import type { CompanyAgentsDoc, ProjectAgentsDoc } from '#/types/agent-doc.types.js';
import type { DeepPartial } from '#/types/config.types.js';

const same = (a: unknown, b: unknown): boolean => stableJson(a) === stableJson(b);

/** Keys of a definition compared one by one when a built-in is stored as a diff. */
const DIFF_KEYS = [
  'name',
  'description',
  'role',
  'instructions',
  'tools',
  'write_scope',
  'inputs',
  'output',
  'skills',
  'archived',
] as const;

/** An id from a display name: lowercase words joined by `-`, 2 to 48 characters; null when nothing usable is left. */
export function slugifyAgentName(name: string): string | null {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/^[0-9-]+/, '')
    .slice(0, 48)
    .replace(/-+$/g, '');

  return /^[a-z][a-z0-9-]{1,47}$/.test(slug) ? slug : null;
}

/**
 * The fields of `next` that differ from `base`, as a partial definition. Nested objects
 * (`runs_on`, `memory`, `budget`) are compared key by key so the stored diff stays small;
 * lists and the `tools` union replace whole.
 */
export function diffAgent(
  base: AgentDefinition,
  next: AgentDefinition,
): DeepPartial<AgentDefinition> {
  const out: Record<string, unknown> = {};

  for (const key of DIFF_KEYS) {
    if (!same(base[key], next[key])) {
      out[key] = next[key];
    }
  }

  const runsOn: Record<string, unknown> = {};
  for (const key of ['harness', 'model', 'fallbacks'] as const) {
    if (!same(base.runs_on[key], next.runs_on[key])) {
      runsOn[key] = next.runs_on[key];
    }
  }

  if (Object.keys(runsOn).length > 0) {
    out['runs_on'] = runsOn;
  }

  for (const key of ['memory', 'budget'] as const) {
    if (!same(base[key], next[key])) {
      out[key] = next[key];
    }
  }

  return out as DeepPartial<AgentDefinition>;
}

function withCompanyAgents(
  doc: CompanyOverride,
  agents: CompanyAgentsDoc,
): CompanyOverride {
  const rest = { ...doc };
  delete rest.agents;

  return Object.keys(agents).length === 0 ? rest : { ...rest, agents };
}

/** `doc` with a new custom company agent stored whole. */
export function addCompanyAgent(
  doc: CompanyOverride,
  id: string,
  def: AgentDefinition,
): CompanyOverride {
  return withCompanyAgents(doc, { ...doc.agents, [id]: def });
}

/**
 * `doc` with company agent `id` set to `next`: a built-in as the diff against the shipped
 * definition (the key disappears when nothing differs), a custom agent whole.
 */
export function storeCompanyAgent(
  doc: CompanyOverride,
  id: string,
  next: AgentDefinition,
): CompanyOverride {
  const shipped = BUILTIN_AGENTS[id];
  const agents: CompanyAgentsDoc = { ...doc.agents };

  if (shipped === undefined || next.origin !== 'builtin') {
    agents[id] = next;

    return withCompanyAgents(doc, agents);
  }

  const diff = diffAgent(shipped, next);
  if (Object.keys(diff).length === 0) {
    delete agents[id];
  } else {
    agents[id] = diff;
  }

  return withCompanyAgents(doc, agents);
}

/** `doc` without the stored edits of agent `id`: a built-in returns to what the release ships. */
export function resetCompanyAgent(doc: CompanyOverride, id: string): CompanyOverride {
  const agents: CompanyAgentsDoc = { ...doc.agents };
  delete agents[id];

  return withCompanyAgents(doc, agents);
}

function withProjectAgents(
  doc: ProjectOverride,
  agents: ProjectAgentsDoc,
): ProjectOverride {
  const rest = { ...doc };
  delete rest.agents;
  const pruned: ProjectAgentsDoc = {
    ...(Object.keys(agents.custom ?? {}).length > 0 ? { custom: agents.custom } : {}),
    ...(Object.keys(agents.overrides ?? {}).length > 0
      ? { overrides: agents.overrides }
      : {}),
    ...((agents.disabled ?? []).length > 0 ? { disabled: agents.disabled } : {}),
  };

  return Object.keys(pruned).length === 0 ? rest : { ...rest, agents: pruned };
}

/** `doc` with a project agent stored whole under `custom`. */
export function addProjectAgent(
  doc: ProjectOverride,
  id: string,
  def: AgentDefinition,
): ProjectOverride {
  const a = doc.agents ?? {};

  return withProjectAgents(doc, { ...a, custom: { ...a.custom, [id]: def } });
}

/** Same as `addProjectAgent`; a save replaces the stored definition of a project agent. */
export const storeProjectAgent = addProjectAgent;

/**
 * `doc` with the project's override of company agent `id`. Only `instructions` and `runs_on`
 * can differ per project, and only values that differ from `base` are kept; an override equal
 * to the company agent is removed.
 */
export function storeProjectOverride(
  doc: ProjectOverride,
  id: string,
  override: Pick<AgentInput, 'instructions' | 'runs_on'>,
  base: AgentDefinition,
): ProjectOverride {
  const a = doc.agents ?? {};
  const overrides = { ...a.overrides };
  const kept: { instructions?: string; runs_on?: AgentDefinition['runs_on'] } = {
    ...(same(override.instructions, base.instructions)
      ? {}
      : { instructions: override.instructions }),
    ...(same(override.runs_on, base.runs_on) ? {} : { runs_on: override.runs_on }),
  };

  if (Object.keys(kept).length === 0) {
    delete overrides[id];
  } else {
    overrides[id] = kept;
  }

  return withProjectAgents(doc, { ...a, overrides });
}

/** `doc` without the project's override of company agent `id`. */
export function resetProjectOverride(doc: ProjectOverride, id: string): ProjectOverride {
  const a = doc.agents ?? {};
  const overrides = { ...a.overrides };
  delete overrides[id];

  return withProjectAgents(doc, { ...a, overrides });
}

/** `doc` with company agent `id` switched off (or back on) for this project. */
export function setProjectDisabled(
  doc: ProjectOverride,
  id: string,
  disabled: boolean,
): ProjectOverride {
  const a = doc.agents ?? {};
  const others = (a.disabled ?? []).filter((d) => d !== id);

  return withProjectAgents(doc, {
    ...a,
    disabled: disabled ? [...others, id].sort() : others,
  });
}
